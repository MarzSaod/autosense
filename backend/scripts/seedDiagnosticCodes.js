import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { pool } from "../src/db/pool.js";

const csvPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "powertrain_codes_raw.csv"
);

const systemProfiles = {
  "Fuel and Air Metering": {
    common_causes:
      "Often linked to a dirty or failing sensor, a vacuum leak, or a fuel delivery issue such as a clogged injector or a weak fuel pump.",
    typical_repair:
      "Typically resolved by cleaning or replacing the affected sensor, repairing a vacuum leak, or servicing the fuel delivery system.",
    est_cost_min: 120,
    est_cost_max: 420,
    est_time_min_hours: 1,
    est_time_max_hours: 3,
    suggested_service_id: 4,
  },
  "Ignition System or Misfire": {
    common_causes:
      "Usually tied to worn spark plugs or ignition coils, a damaged wiring harness, or a timing related issue.",
    typical_repair:
      "Typically resolved by replacing spark plugs or ignition coils and inspecting the related wiring.",
    est_cost_min: 100,
    est_cost_max: 380,
    est_time_min_hours: 1,
    est_time_max_hours: 2.5,
    suggested_service_id: 4,
  },
  "Auxiliary Emissions Controls": {
    common_causes:
      "Commonly linked to a failing catalytic converter, a faulty oxygen sensor, or a leak in the EVAP system.",
    typical_repair:
      "Typically resolved by replacing the faulty emissions component or sealing a leak in the EVAP system.",
    est_cost_min: 150,
    est_cost_max: 500,
    est_time_min_hours: 1,
    est_time_max_hours: 3,
    suggested_service_id: 4,
  },
  "Vehicle Speed Control and Idle Control": {
    common_causes:
      "Often caused by a dirty throttle body, a failing idle air control valve, or a vehicle speed sensor issue.",
    typical_repair:
      "Typically resolved by cleaning the throttle body or replacing the idle control or speed sensor component.",
    est_cost_min: 90,
    est_cost_max: 300,
    est_time_min_hours: 0.5,
    est_time_max_hours: 2,
    suggested_service_id: 4,
  },
  "Computer and Output Circuit": {
    common_causes:
      "Usually related to a wiring or connector fault, a relay failure, or in some cases the engine control module itself.",
    typical_repair:
      "Typically resolved by repairing the wiring or connector, replacing a faulty relay, or reprogramming or replacing the control module.",
    est_cost_min: 150,
    est_cost_max: 600,
    est_time_min_hours: 1,
    est_time_max_hours: 3,
    suggested_service_id: 4,
  },
  Transmission: {
    common_causes:
      "Commonly linked to low or degraded transmission fluid, a failing solenoid, or a sensor issue inside the transmission.",
    typical_repair:
      "Typically resolved by a transmission fluid and filter service, or replacing the specific faulty solenoid or sensor.",
    est_cost_min: 200,
    est_cost_max: 900,
    est_time_min_hours: 1,
    est_time_max_hours: 4,
    suggested_service_id: 6,
  },
  "Hybrid and Electric Powertrain": {
    common_causes:
      "Often related to the high voltage battery pack, a hybrid inverter or converter fault, or a sensor monitoring the electric drive system.",
    typical_repair:
      "Typically requires diagnosis by a technician trained in hybrid and electric systems, since repairs often involve the high voltage battery pack or drive electronics rather than a standard engine component.",
    est_cost_min: 300,
    est_cost_max: 1200,
    est_time_min_hours: 1,
    est_time_max_hours: 5,
    suggested_service_id: 4,
  },
};

const systemByDigit = {
  0: "Fuel and Air Metering",
  1: "Fuel and Air Metering",
  2: "Fuel and Air Metering",
  3: "Ignition System or Misfire",
  4: "Auxiliary Emissions Controls",
  5: "Vehicle Speed Control and Idle Control",
  6: "Computer and Output Circuit",
  7: "Transmission",
  8: "Transmission",
  9: "Transmission",
};

const HYBRID_SYSTEM = "Hybrid and Electric Powertrain";

function classify(code) {
  const marker = code[2];

  if (marker === "A" || marker === "B" || marker === "C") {
    return HYBRID_SYSTEM;
  }

  return systemByDigit[marker] || null;
}

async function run() {
  const records = parse(readFileSync(csvPath), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const seen = new Set();
  const rows = [];
  let duplicates = 0;
  let unclassified = 0;

  for (const record of records) {
    const code = (record.Code || "").trim();
    const description = (record["Condition Description"] || "").trim();

    if (!code || !description) continue;

    if (seen.has(code)) {
      duplicates += 1;
      continue;
    }
    seen.add(code);

    const system = classify(code);
    if (!system) {
      unclassified += 1;
      continue;
    }

    rows.push({ code, description, system, ...systemProfiles[system] });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM diagnostic_codes");

    for (const row of rows) {
      await client.query(
        `INSERT INTO diagnostic_codes
          (code, description, system, common_causes, typical_repair,
           est_cost_min, est_cost_max, est_time_min_hours, est_time_max_hours,
           suggested_service_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          row.code,
          row.description,
          row.system,
          row.common_causes,
          row.typical_repair,
          row.est_cost_min,
          row.est_cost_max,
          row.est_time_min_hours,
          row.est_time_max_hours,
          row.suggested_service_id,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const { rows: counts } = await pool.query(
    "SELECT system, count(*)::int AS total FROM diagnostic_codes GROUP BY system ORDER BY system"
  );

  console.log(`rows read from csv: ${records.length}`);
  console.log(`duplicate codes skipped: ${duplicates}`);
  console.log(`unclassified codes skipped: ${unclassified}`);
  console.log(`rows inserted: ${rows.length}`);
  console.log("");
  console.log("per system:");
  for (const { system, total } of counts) {
    console.log(`  ${system}: ${total}`);
  }
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
