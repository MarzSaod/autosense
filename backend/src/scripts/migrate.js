import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db/pool.js";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "db",
  "migrations"
);

async function run() {
  const entries = await readdir(migrationsDir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();

  const bootstrap = await readFile(
    path.join(migrationsDir, "000_migrations_table.sql"),
    "utf8"
  );
  await pool.query(bootstrap);

  const { rows } = await pool.query("SELECT filename FROM applied_migrations");
  const applied = new Set(rows.map((row) => row.filename));

  let count = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skipping ${file}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO applied_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`applied ${file}`);
      count += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`${count} migration(s) applied`);
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
