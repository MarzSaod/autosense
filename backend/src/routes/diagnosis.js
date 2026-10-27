import express from "express";
import rateLimit from "express-rate-limit";
import { pool, query } from "../db/pool.js";
import { matchWithGemini } from "../services/gemini.js";

const router = express.Router();

const GENERAL_INSPECTION_SERVICE_ID = 8;

// Cover-density ranking (ts_rank_cd) scores a row by how many of the query's
// terms it covers, so it does not shrink as the customer's description gets
// longer the way ts_rank does. A row that matches a single term scores 0.1,
// which is therefore the floor for "matched at all"; multi-term matches score
// higher and sort above it.
const MIN_MATCH_RANK = 0.1;

const GEMINI_TIMEOUT_MS = 8000;

const outOfContextSummary =
  "That does not look like a description of a problem with a vehicle, so we could not prepare an estimate. Please describe what the car is doing, such as a noise, a warning light, or how it drives.";

const generalFallback = {
  estCostMin: 50,
  estCostMax: 90,
  estTimeMinHours: 0.75,
  estTimeMaxHours: 0.75,
  summary:
    "The description could not be narrowed down to a specific issue, so a general inspection is the recommended next step.",
};

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please wait a moment and try again." },
});

const STOP_WORDS = new Set([
  "and",
  "the",
  "is",
  "a",
  "my",
  "in",
  "on",
  "at",
  "with",
  "when",
  "engine",
  "car",
  "vehicle",
  "sensor",
  "system",
  "control",
  "circuit",
  "malfunction",
  "performance",
  "problem",
  "issue",
  "noise",
  "light",
  "check",
  "working",
  "broken",
  "not",
  "bad",
  "badly",
]);

const AUTOMOTIVE_VOCABULARY = new Set([
  "car",
  "cars",
  "vehicle",
  "truck",
  "suv",
  "engine",
  "motor",
  "transmission",
  "gear",
  "gears",
  "shifting",
  "shift",
  "clutch",
  "brake",
  "brakes",
  "braking",
  "tire",
  "tires",
  "wheel",
  "wheels",
  "steering",
  "battery",
  "alternator",
  "radiator",
  "coolant",
  "exhaust",
  "muffler",
  "fuel",
  "gas",
  "gasoline",
  "diesel",
  "oil",
  "dashboard",
  "headlight",
  "headlights",
  "taillight",
  "wiper",
  "wipers",
  "windshield",
  "horn",
  "seatbelt",
  "airbag",
  "suspension",
  "bearing",
  "belt",
  "hose",
  "spark",
  "ignition",
  "catalytic",
  "converter",
  "emission",
  "emissions",
  "sensor",
  "mechanic",
  "shop",
  "repair",
  "idle",
  "idling",
  "stall",
  "stalling",
  "stalled",
  "rpm",
  "mileage",
  "odometer",
  "drive",
  "driving",
  "drove",
  "start",
  "starting",
  "started",
  "noise",
  "sound",
  "smell",
  "smoke",
  "leak",
  "leaking",
  "shake",
  "shaking",
  "vibrate",
  "vibrating",
  "vibration",
  "rattle",
  "rattling",
  "grind",
  "grinding",
  "squeal",
  "squealing",
  "click",
  "clicking",
  "knock",
  "knocking",
  "misfire",
  "misfiring",
  "overheat",
  "overheating",
  "temperature",
  "light",
  "warning",
  "hood",
  "trunk",
  "pedal",
  "accelerator",
  "acceleration",
  "accelerate",
]);

const BLOCKED_WORDS = new Set([
  "tire",
  "brake",
  "brakes",
  "wiper",
  "windshield",
  "seatbelt",
  "radio",
  "door",
  "steering",
]);

function cleanWords(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function hasAutomotiveWord(words) {
  return words.some((word) => AUTOMOTIVE_VOCABULARY.has(word));
}

function hasBlockedWord(words) {
  return words.some((word) => BLOCKED_WORDS.has(word));
}

function buildTsQuery(words) {
  const terms = words.filter((word) => !STOP_WORDS.has(word));

  return [...new Set(terms)].join(" | ");
}

function withTimeout(promise, ms) {
  let timer;

  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Gemini did not respond within ${ms}ms`)),
      ms
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fallbackSummary(candidate) {
  return `Based on your description, the most likely issue is ${candidate.description.toLowerCase()}, which relates to the ${candidate.system.toLowerCase()} part of your vehicle. A technician will confirm this during the inspection.`;
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

async function persist(description, summary, chosen, candidates) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO diagnosis_requests
        (customer_description, ai_diagnosis_summary, est_cost_min, est_cost_max,
         est_time_min_hours, est_time_max_hours, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'new')
       RETURNING id`,
      [
        description,
        summary,
        chosen.estCostMin,
        chosen.estCostMax,
        chosen.estTimeMinHours,
        chosen.estTimeMaxHours,
      ]
    );

    const requestId = rows[0].id;

    if (chosen.id) {
      const ordered = [
        chosen.id,
        ...candidates
          .map((candidate) => candidate.id)
          .filter((id) => id !== chosen.id),
      ];

      for (let index = 0; index < ordered.length; index += 1) {
        await client.query(
          `INSERT INTO diagnosis_request_codes
            (diagnosis_request_id, diagnostic_code_id, relevance_rank)
           VALUES ($1, $2, $3)`,
          [requestId, ordered[index], index + 1]
        );
      }
    }

    await client.query("COMMIT");
    return requestId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

router.post("/", limiter, async (req, res, next) => {
  try {
    const { description } = req.body || {};

    if (typeof description !== "string" || description.trim().length < 10) {
      res.status(400).json({
        error:
          "Please describe the problem in at least 10 characters so we can look it up.",
      });
      return;
    }

    const cleanDescription = description.trim();

    const words = cleanWords(cleanDescription);

    if (!hasAutomotiveWord(words)) {
      const id = await persist(
        cleanDescription,
        outOfContextSummary,
        {
          id: null,
          estCostMin: null,
          estCostMax: null,
          estTimeMinHours: null,
          estTimeMaxHours: null,
        },
        []
      );

      res.json({
        id,
        customerDescription: cleanDescription,
        matchedCode: null,
        summary: outOfContextSummary,
        estCostMin: null,
        estCostMax: null,
        estTimeMinHours: null,
        estTimeMaxHours: null,
        suggestedServiceId: null,
        confidence: "out_of_context",
        outOfContext: true,
      });
      return;
    }

    const tsQuery = hasBlockedWord(words) ? "" : buildTsQuery(words);

    const { rows: candidates } = tsQuery
      ? await query(
          `SELECT id, code, description, system, common_causes,
                  est_cost_min, est_cost_max, est_time_min_hours, est_time_max_hours,
                  suggested_service_id
             FROM diagnostic_codes
            WHERE search_vector @@ to_tsquery('english', $1)
              AND ts_rank_cd(search_vector, to_tsquery('english', $1)) >= $2
            ORDER BY ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC,
                     ts_rank(search_vector, to_tsquery('english', $1)) DESC,
                     id ASC
            LIMIT 5`,
          [tsQuery, MIN_MATCH_RANK]
        )
      : { rows: [] };

    if (candidates.length === 0) {
      const chosen = {
        id: null,
        estCostMin: generalFallback.estCostMin,
        estCostMax: generalFallback.estCostMax,
        estTimeMinHours: generalFallback.estTimeMinHours,
        estTimeMaxHours: generalFallback.estTimeMaxHours,
      };

      const id = await persist(
        cleanDescription,
        generalFallback.summary,
        chosen,
        []
      );

      res.json({
        id,
        customerDescription: cleanDescription,
        matchedCode: null,
        summary: generalFallback.summary,
        estCostMin: generalFallback.estCostMin,
        estCostMax: generalFallback.estCostMax,
        estTimeMinHours: generalFallback.estTimeMinHours,
        estTimeMaxHours: generalFallback.estTimeMaxHours,
        suggestedServiceId: GENERAL_INSPECTION_SERVICE_ID,
        confidence: "low",
      });
      return;
    }

    let matched = candidates[0];
    let summary = fallbackSummary(matched);

    try {
      const result = await withTimeout(
        matchWithGemini(cleanDescription, candidates),
        GEMINI_TIMEOUT_MS
      );
      const picked = candidates.find(
        (candidate) => candidate.id === result.matchedCodeId
      );

      if (picked) {
        matched = picked;
        summary = result.summary;
      }
    } catch (error) {
      console.error("Gemini matching failed, using top ranked candidate:", error.message);
    }

    const chosen = {
      id: matched.id,
      estCostMin: toNumber(matched.est_cost_min),
      estCostMax: toNumber(matched.est_cost_max),
      estTimeMinHours: toNumber(matched.est_time_min_hours),
      estTimeMaxHours: toNumber(matched.est_time_max_hours),
    };

    const id = await persist(cleanDescription, summary, chosen, candidates);

    res.json({
      id,
      customerDescription: cleanDescription,
      matchedCode: {
        code: matched.code,
        description: matched.description,
        system: matched.system,
      },
      summary,
      estCostMin: chosen.estCostMin,
      estCostMax: chosen.estCostMax,
      estTimeMinHours: chosen.estTimeMinHours,
      estTimeMaxHours: chosen.estTimeMaxHours,
      suggestedServiceId: matched.suggested_service_id,
      confidence: "normal",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
