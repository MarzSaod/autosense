import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../src/db/pool.js";

const EMAIL = process.env.ADMIN_SEED_EMAIL;
const PASSWORD = process.env.ADMIN_SEED_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "Missing required environment variables: set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in .env or the shell.",
  );
  process.exit(1);
}

async function run() {
  const { rows } = await pool.query(
    "SELECT 1 FROM staff_users WHERE email = $1",
    [EMAIL],
  );

  if (rows.length > 0) {
    console.log(`skipped: ${EMAIL} already exists`);
  } else {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await pool.query(
      "INSERT INTO staff_users (name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5)",
      ["Admin", EMAIL, hash, "admin", true],
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
