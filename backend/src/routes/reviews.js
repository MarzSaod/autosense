import express from "express";
import { query } from "../db/pool.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { rows: reviews } = await query(
      `SELECT r.id, r.customer_name, r.rating, r.review_text,
              r.is_featured,
              -- Review dates only ever show a day. Formatted in SQL as text so
              -- the driver cannot reinterpret it through the server's timezone
              -- (a bare ::date comes back as a JS Date at local midnight, which
              -- serializes to the previous day west of UTC).
              to_char(r.created_at, 'YYYY-MM-DD') AS created_at,
              r.service_id,
              s.name AS service_name
         FROM reviews r
         LEFT JOIN services s ON s.id = r.service_id
        ORDER BY r.created_at DESC`
    );

    const { rows: summaryRows } = await query(
      `SELECT round(avg(rating), 1)::float8 AS average,
              count(*)::int                 AS count
         FROM reviews`
    );

    res.json({
      reviews,
      summary: {
        average: summaryRows[0].average ?? 0,
        count: summaryRows[0].count,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
