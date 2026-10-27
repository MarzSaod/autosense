import express from "express";
import { query } from "../db/pool.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, description, image_url,
              est_price_min::float8  AS est_price_min,
              est_price_max::float8  AS est_price_max,
              est_duration_minutes
         FROM services
        WHERE is_active = true
        ORDER BY id ASC`
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
