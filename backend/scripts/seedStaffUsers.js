import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../src/db/pool.js";

const EMAIL = "admin@autosense.com";

async function run() {
  const { rows } = await pool.query(
    "SELECT 1 FROM staff_users WHERE email = $1",
    [EMAIL]
  );

  if (rows.length > 0) {
    console.log(`skipped: ${EMAIL} already exists`);
  } else {
    const hash = await bcrypt.hash("changeme123", 10);
    await pool.query(
      "INSERT INTO staff_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
      ["Admin", EMAIL, hash, "admin"]
    );
    console.log(`inserted: ${EMAIL}`);
  }
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
