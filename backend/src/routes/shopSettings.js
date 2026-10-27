import express from "express";
import { query } from "../db/pool.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT shop_name, address, phone, email, hours_json,
              appointment_duration_minutes, max_concurrent_appointments
         FROM shop_settings
        LIMIT 1`
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Shop settings have not been set up." });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
