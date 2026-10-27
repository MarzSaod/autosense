import express from "express";
import { query } from "../db/pool.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const category =
      typeof req.query.category === "string" && req.query.category.trim()
        ? req.query.category.trim()
        : null;

    const { rows } = await query(
      `SELECT id, image_url, caption, category, display_order
         FROM gallery_images
        WHERE $1::text IS NULL OR category = $1
        ORDER BY display_order ASC`,
      [category]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
