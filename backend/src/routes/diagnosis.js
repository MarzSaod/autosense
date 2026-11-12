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

  // Words customers actually use for the service categories the OBD2 dataset
  // does not cover. Without these the vocabulary gate rejected real complaints
  // ("my AC blows warm air") as non-automotive. Additions only; nothing above
  // was removed, and duplicates are harmless in a Set.

  // AC and heating
  "ac",
  "air",
  "conditioning",
  "heater",
  "heating",
  "heat",
  "warm",
  "cold",
  "coldest",
  "blowing",
  "blows",
  "defrost",
  "defroster",
  "climate",
  "hvac",
  "coolant",
  "thermostat",
  "compressor",
  "refrigerant",
  "vent",
  "vents",

  // Brakes
  "brake",
  "brakes",
  "braking",
  "squeal",
  "squealing",
  "squeaks",
  "stopping",
  "stop",
  "pedal",
  "rotor",
  "rotors",
  "pads",
  "caliper",
  "calipers",
  "abs",

  // Tires and alignment
  "tire",
  "tires",
  "tyre",
  "tyres",
  "alignment",
  "pulls",
  "pulling",
  "vibration",
  "vibrating",
  "wobble",
  "wobbling",
  "balance",
  "balancing",
  "rotation",
  "flat",
  "pressure",
  "tread",

  // Battery and charging
  "battery",
  "jump",
  "jumpstart",
  "cranking",
  "crank",
  "start",
  "starting",
  "dead",
  "charge",
  "charging",
  "alternator",
  "terminal",
  "terminals",
  "voltage",

  // Oil service
  "oil",
  "lube",
  "lubrication",
  "dipstick",
  "filter",
  "synthetic",
  "conventional",
  "viscosity",
  "change",
  "drain",

  // Transmission
  "transmission",
  "shifting",
  "shift",
  "gear",
  "gears",
  "grinding",
  "slipping",
  "slip",
  "clutch",
  "neutral",
  "reverse",
  "overdrive",
  "torque",
  "converter",
  "fluid",
  "cvt",
  "automatic",
  "manual",

  // General vehicle words
  "mileage",
  "odometer",
  "dashboard",
  "warning",
  "indicator",
  "stalling",
  "stall",
  "overheating",
  "overheat",
  "radiator",
  "hose",
  "belt",
  "belts",
  "serpentine",
  "exhaust",
  "muffler",
  "catalytic",
  "suspension",
  "shock",
  "shocks",
  "strut",
  "struts",
  "steering",
  "wheel",
  "axle",
  "differential",
  "driveshaft",
  "rpm",
  "idle",
  "idling",
  "misfire",
  "spark",
  "plug",
  "plugs",
  "ignition",
  "fuel",
  "gasoline",
  "diesel",
  "injector",
  "injectors",
  "pump",
  "leak",
  "leaking",
  "leaks",
  "smoke",
  "burning",
  "smell",
  "noise",
  "knocking",
  "clicking",
  "rattling",
  "humming",
  "whining",
  "cruise",
  "speed",
  "hybrid",
  "inverter",
  "ev",
  "electric",
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

/**
 * Symptom keywords per service, for the categories the diagnostic_codes
 * dataset cannot speak to. Each service has several groups; a match needs
 * words from at least two different groups, so a passing mention of "oil" does
 * not by itself become an Oil Change.
 *
 * `distinctive` lists the groups whose wording belongs to this service and
 * almost nothing else ("brakes", "alignment", "battery"). A description that
 * hits only one group still matches when that group is distinctive - "the car
 * pulls to one side" is an alignment complaint and nothing else, even though
 * it names no second symptom.
 */
const SERVICE_KEYWORD_RULES = [
  {
    service: "Brake Repair",
    groups: [
      ["brake", "brakes", "braking"],
      ["squeal", "squealing", "squeaks", "grinding", "noise", "sound"],
      ["stopping", "stop", "slow", "longer", "pedal", "soft", "spongy"],
      ["rotor", "rotors", "pads", "pad", "caliper", "calipers", "abs"],
    ],
    distinctive: [0, 3],
  },
  {
    service: "AC & Heating Repair",
    groups: [
      ["ac", "air conditioning", "conditioning", "hvac", "climate"],
      ["heater", "heating", "heat", "defroster", "defrost"],
      ["warm", "hot", "cold", "coldest", "cool", "blowing", "blows"],
      ["compressor", "refrigerant", "thermostat", "vent", "vents"],
    ],
    distinctive: [0, 1, 3],
  },
  {
    service: "Tire Rotation & Alignment",
    groups: [
      ["tire", "tires", "tyre", "tyres"],
      ["alignment", "aligned", "pulls", "pulling", "pull", "drifts", "drifting"],
      ["vibration", "vibrating", "wobble", "wobbling", "shaking", "shake"],
      ["balance", "balancing", "rotation", "rotate", "uneven", "wear", "tread"],
    ],
    distinctive: [0, 1],
  },
  {
    service: "Battery Replacement",
    groups: [
      ["battery"],
      ["dead", "died", "jump", "jumpstart", "cranking", "crank"],
      ["start", "starting", "won't start", "doesn't start", "no start"],
      ["charge", "charging", "voltage", "terminal", "terminals", "alternator"],
    ],
    distinctive: [0],
  },
  {
    service: "Oil Change",
    groups: [
      ["oil"],
      [
        "change",
        "changed",
        "changing",
        "due",
        "overdue",
        "months",
        "miles",
        "mileage",
      ],
      ["filter", "drain", "dipstick", "level", "low", "dark", "dirty"],
      ["lube", "lubrication", "synthetic", "conventional"],
    ],
    // "oil" alone is exactly the false positive the two-group rule exists to
    // prevent, so no group here stands on its own.
    distinctive: [],
  },
  {
    service: "Transmission Service",
    groups: [
      ["transmission", "tranny", "trans"],
      ["shifting", "shift", "shifts", "gear", "gears"],
      [
        "grinding",
        "slipping",
        "slip",
        "slips",
        "jerking",
        "jerks",
        "hesitating",
      ],
      ["clutch", "neutral", "reverse", "fluid", "cvt", "torque", "converter"],
    ],
    distinctive: [0],
  },
];

/**
 * Score every keyword rule against the description and return the best match,
 * or null. Single-word keywords are matched against the tokenised words so
 * "air" cannot match inside another word; multi-word keywords are matched as a
 * phrase against the whole description.
 */
function matchByKeywords(description, words) {
  const haystack = description.toLowerCase();
  const wordSet = new Set(words);

  const scored = SERVICE_KEYWORD_RULES.map((rule) => {
    const matchedGroups = [];

    rule.groups.forEach((group, index) => {
      const hit = group.some((keyword) =>
        keyword.includes(" ") ? haystack.includes(keyword) : wordSet.has(keyword)
      );
      if (hit) matchedGroups.push(index);
    });

    const qualifies =
      matchedGroups.length >= 2 ||
      matchedGroups.some((index) => rule.distinctive.includes(index));

    return {
      service: rule.service,
      groupCount: matchedGroups.length,
      matchedGroups,
      qualifies,
    };
  }).filter((entry) => entry.qualifies);

  if (scored.length === 0) return null;

  // Most groups wins; a two-group match beats a lone distinctive group.
  scored.sort((a, b) => b.groupCount - a.groupCount);
  return scored[0];
}

/**
 * Service ids that some diagnostic code points at. Only these categories can
 * ever come out of the text search, so a keyword match for anything else is
 * the only signal available and should not wait for a search that cannot
 * answer. Cached briefly: it only changes when the codes are re-seeded.
 */
const COVERAGE_TTL_MS = 10 * 60 * 1000;
let coverageCache = { ids: null, loadedAt: 0 };

async function loadCoveredServiceIds() {
  if (coverageCache.ids && Date.now() - coverageCache.loadedAt < COVERAGE_TTL_MS) {
    return coverageCache.ids;
  }

  const { rows } = await query(
    `SELECT DISTINCT suggested_service_id
       FROM diagnostic_codes
      WHERE suggested_service_id IS NOT NULL`
  );

  const ids = new Set(rows.map((row) => row.suggested_service_id));
  coverageCache = { ids, loadedAt: Date.now() };
  return ids;
}

async function loadServiceByName(name) {
  const { rows } = await query(
    `SELECT id, name, est_price_min, est_price_max, est_duration_minutes
       FROM services
      WHERE name = $1`,
    [name]
  );
  return rows[0] || null;
}

/**
 * Build the response for a keyword match. The estimate comes from the services
 * table, since there is no diagnostic code to read cost or time from, and
 * Gemini is not called: it re-ranks codes, and there are none to rank.
 */
async function respondWithKeywordMatch(res, cleanDescription, service) {
  const estTimeHours = Number(service.est_duration_minutes) / 60;
  const chosen = {
    id: null,
    estCostMin: toNumber(service.est_price_min),
    estCostMax: toNumber(service.est_price_max),
    estTimeMinHours: estTimeHours,
    estTimeMaxHours: estTimeHours,
  };

  const summary = `Based on your description, this is the most likely service needed: ${service.name}. A technician will confirm this during the inspection.`;

  const id = await persist(cleanDescription, summary, chosen, []);

  res.json({
    id,
    customerDescription: cleanDescription,
    matchedCode: null,
    matchedService: { id: service.id, name: service.name },
    summary,
    estCostMin: chosen.estCostMin,
    estCostMax: chosen.estCostMax,
    estTimeMinHours: chosen.estTimeMinHours,
    estTimeMaxHours: chosen.estTimeMaxHours,
    suggestedServiceId: service.id,
    confidence: "normal",
    matchSource: "keyword",
  });
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

    // Keyword layer. The diagnostic_codes dataset is powertrain only: every
    // code suggests either Engine Diagnostics or Transmission Service, so for
    // brakes, tires, AC, batteries and oil the text search can only ever
    // return a loosely related engine code or nothing at all. A confident
    // keyword match for one of those uncovered categories is therefore the
    // best signal available and is answered directly; for the categories the
    // dataset does cover, the existing search plus Gemini re-rank still runs.
    const keywordMatch = matchByKeywords(cleanDescription, words);
    let keywordService = null;

    if (keywordMatch) {
      keywordService = await loadServiceByName(keywordMatch.service);

      if (keywordService) {
        const coveredServiceIds = await loadCoveredServiceIds();

        if (!coveredServiceIds.has(keywordService.id)) {
          await respondWithKeywordMatch(res, cleanDescription, keywordService);
          return;
        }
      }
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
      // Nothing to re-rank. A keyword match for a covered category (which the
      // block above deliberately left to the search) is still far better than
      // a generic inspection.
      if (keywordService) {
        await respondWithKeywordMatch(res, cleanDescription, keywordService);
        return;
      }

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
