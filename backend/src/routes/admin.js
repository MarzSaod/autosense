import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, query } from "../db/pool.js";
import auth from "../middleware/auth.js";
import { sendBookingStatusEmail } from "../lib/emailService.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      "SELECT id, name, email, password_hash, role FROM staff_users WHERE email = $1",
      [email]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", auth, async (req, res) => {
  res.json({ message: "Logged out" });
});

router.get("/me", auth, async (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
  });
});

router.get("/stats", auth, async (req, res, next) => {
  try {
    const [servicesRes, totalBookingsRes, pendingBookingsRes, galleryRes, unreadRes] =
      await Promise.all([
        query("SELECT count(*)::int AS count FROM services WHERE is_active = true"),
        query("SELECT count(*)::int AS count FROM bookings"),
        query("SELECT count(*)::int AS count FROM bookings WHERE status = 'pending'"),
        query("SELECT count(*)::int AS count FROM gallery_images"),
        query("SELECT count(*)::int AS count FROM contact_messages WHERE is_read = false"),
      ]);

    res.json({
      services: servicesRes.rows[0].count,
      totalBookings: totalBookingsRes.rows[0].count,
      pendingBookings: pendingBookingsRes.rows[0].count,
      galleryImages: galleryRes.rows[0].count,
      unreadMessages: unreadRes.rows[0].count,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/services", auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, description, image_url,
              est_price_min::float8 AS est_price_min,
              est_price_max::float8 AS est_price_max,
              est_duration_minutes,
              is_active, created_at, updated_at
         FROM services
        ORDER BY id ASC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post("/services", auth, async (req, res, next) => {
  try {
    const { name, description, image_url, est_price_min, est_price_max, est_duration_minutes } = req.body;

    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const { rows } = await query(
      `INSERT INTO services (name, description, image_url, est_price_min, est_price_max, est_duration_minutes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, name, description, image_url,
                 est_price_min::float8 AS est_price_min,
                 est_price_max::float8 AS est_price_max,
                 est_duration_minutes, is_active, created_at, updated_at`,
      [name, description || null, image_url || null, est_price_min || null, est_price_max || null, est_duration_minutes || null]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/services/:id", auth, async (req, res, next) => {
  try {
    const allowed = ["name", "description", "image_url", "est_price_min", "est_price_max", "est_duration_minutes", "is_active"];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx}`);
        values.push(req.body[field]);
        idx += 1;
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    sets.push(`updated_at = now()`);
    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE services SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, name, description, image_url,
                 est_price_min::float8 AS est_price_min,
                 est_price_max::float8 AS est_price_max,
                 est_duration_minutes, is_active, created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/services/:id", auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE services SET is_active = false, updated_at = now() WHERE id = $1
       RETURNING id, name, description, image_url,
                 est_price_min::float8 AS est_price_min,
                 est_price_max::float8 AS est_price_max,
                 est_duration_minutes, is_active, created_at, updated_at`,
      [req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get("/bookings", auth, async (req, res, next) => {
  try {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (req.query.status) {
      conditions.push(`b.status = $${idx}`);
      values.push(req.query.status);
      idx += 1;
    }

    if (req.query.date_from) {
      conditions.push(`b.appointment_date >= $${idx}::date`);
      values.push(req.query.date_from);
      idx += 1;
    }

    if (req.query.date_to) {
      conditions.push(`b.appointment_date <= $${idx}::date`);
      values.push(req.query.date_to);
      idx += 1;
    }

    if (req.query.q) {
      conditions.push(
        `(b.customer_name ILIKE $${idx} OR b.customer_email ILIKE $${idx} OR b.reference_id ILIKE $${idx})`
      );
      values.push(`%${req.query.q}%`);
      idx += 1;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [countResult, dataResult] = await Promise.all([
      query(`SELECT count(*)::int AS total FROM bookings b ${where}`, values),
      query(
        `SELECT b.id, b.customer_name, b.customer_email, b.customer_phone,
                b.vehicle_make, b.vehicle_model, b.vehicle_year,
                to_char(b.appointment_date, 'YYYY-MM-DD') AS appointment_date,
                b.appointment_time::text AS appointment_time,
                b.status, b.notes, b.reference_id, b.created_at,
                COALESCE(
                  json_agg(s.name ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL),
                  '[]'
                ) AS services
           FROM bookings b
           LEFT JOIN booking_services bs ON bs.booking_id = b.id
           LEFT JOIN services s ON s.id = bs.service_id
           ${where}
          GROUP BY b.id
          ORDER BY b.appointment_date DESC, b.appointment_time DESC
          LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset]
      ),
    ]);

    const total = countResult.rows[0].total;

    res.json({
      bookings: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

router.put("/bookings/:id", auth, async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ["pending", "confirmed", "completed", "cancelled"];

    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
      return;
    }

    const sets = [];
    const values = [];
    let idx = 1;

    if (status !== undefined) {
      sets.push(`status = $${idx}`);
      values.push(status);
      idx += 1;
    }

    if (notes !== undefined) {
      sets.push(`notes = $${idx}`);
      values.push(notes);
      idx += 1;
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    sets.push(`updated_at = now()`);
    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE bookings SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, customer_name, customer_email, customer_phone,
                 vehicle_make, vehicle_model, vehicle_year,
                 to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
                 appointment_time::text AS appointment_time,
                 status, notes, reference_id, created_at`,
      values
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    let emailSent = false;
    if (status) {
      emailSent = await sendBookingStatusEmail(rows[0]);
    }

    res.json({ ...rows[0], emailSent });
  } catch (error) {
    next(error);
  }
});

router.get("/gallery", auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, image_url, caption, category, display_order
         FROM gallery_images
        ORDER BY display_order ASC, id ASC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post("/gallery", auth, async (req, res, next) => {
  try {
    const { image_url, caption, category, display_order } = req.body;

    if (!image_url) {
      res.status(400).json({ error: "image_url is required" });
      return;
    }

    const cols = ["image_url", "caption", "category"];
    const vals = [image_url, caption || null, category || null];
    if (display_order != null) {
      cols.push("display_order");
      vals.push(display_order);
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");

    const { rows } = await query(
      `INSERT INTO gallery_images (${cols.join(", ")})
       VALUES (${placeholders})
       RETURNING id, image_url, caption, category, display_order`,
      vals
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/gallery/:id", auth, async (req, res, next) => {
  try {
    const allowed = ["image_url", "caption", "category", "display_order"];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx}`);
        values.push(req.body[field]);
        idx += 1;
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE gallery_images SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, image_url, caption, category, display_order`,
      values
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Gallery image not found" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/gallery/:id", auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      "DELETE FROM gallery_images WHERE id = $1 RETURNING id",
      [req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Gallery image not found" });
      return;
    }

    res.json({ message: "Deleted" });
  } catch (error) {
    next(error);
  }
});

router.get("/stats/charts", auth, async (req, res, next) => {
  try {
    const [byDayRes, byStatusRes] = await Promise.all([
      query(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS date,
                count(b.id)::int AS count
           FROM generate_series(
             current_date - interval '29 days',
             current_date,
             interval '1 day'
           ) AS d
           LEFT JOIN bookings b ON b.appointment_date = d::date
          GROUP BY d::date
          ORDER BY d::date ASC`
      ),
      query(
        `SELECT s.status, count(b.id)::int AS count
           FROM (VALUES ('pending'), ('confirmed'), ('completed'), ('cancelled')) AS s(status)
           LEFT JOIN bookings b ON b.status = s.status
          GROUP BY s.status`
      ),
    ]);

    res.json({
      bookingsByDay: byDayRes.rows,
      bookingsByStatus: byStatusRes.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/activity", auth, async (req, res, next) => {
  try {
    const [bookingsCreated, bookingsUpdated, contacts] = await Promise.all([
      query(
        `SELECT 'booking_created' AS type,
                'New booking from ' || customer_name AS title,
                to_char(appointment_date, 'YYYY-MM-DD') || ' at ' || to_char(appointment_time, 'HH24:MI') AS detail,
                created_at AS timestamp
           FROM bookings
          ORDER BY created_at DESC
          LIMIT 15`
      ),
      query(
        `SELECT 'booking_updated' AS type,
                'Booking ' || COALESCE(reference_id, id::text) || ' updated to ' || status AS title,
                customer_name AS detail,
                updated_at AS timestamp
           FROM bookings
          WHERE updated_at > created_at + interval '1 second'
          ORDER BY updated_at DESC
          LIMIT 15`
      ),
      query(
        `SELECT 'contact_received' AS type,
                'Message from ' || name AS title,
                CASE WHEN length(message) > 80 THEN substring(message, 1, 80) || '...' ELSE message END AS detail,
                created_at AS timestamp
           FROM contact_messages
          ORDER BY created_at DESC
          LIMIT 15`
      ),
    ]);

    const merged = [
      ...bookingsCreated.rows,
      ...bookingsUpdated.rows,
      ...contacts.rows,
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 15);

    res.json(merged);
  } catch (error) {
    next(error);
  }
});

router.get("/contact-messages", auth, async (req, res, next) => {
  try {
    const conditions = [];

    if (req.query.is_read === "true") {
      conditions.push("is_read = true");
    } else if (req.query.is_read === "false") {
      conditions.push("is_read = false");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [countResult, unreadResult, dataResult] = await Promise.all([
      query(`SELECT count(*)::int AS total FROM contact_messages ${where}`),
      query("SELECT count(*)::int AS count FROM contact_messages WHERE is_read = false"),
      query(
        `SELECT id, name, email, message, is_read, responded_at, created_at
           FROM contact_messages
           ${where}
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);

    res.json({
      messages: dataResult.rows,
      total: countResult.rows[0].total,
      page,
      limit,
      totalPages: Math.ceil(countResult.rows[0].total / limit),
      unreadCount: unreadResult.rows[0].count,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/contact-messages/:id", auth, async (req, res, next) => {
  try {
    const allowed = ["is_read", "responded_at"];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx}`);
        values.push(req.body[field]);
        idx += 1;
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE contact_messages SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, name, email, message, is_read, responded_at, created_at`,
      values
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Contact message not found" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get("/staff", auth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, name, email, role, created_at FROM staff_users ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post("/staff", auth, requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required" });
      return;
    }

    const existing = await query("SELECT 1 FROM staff_users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO staff_users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role || "staff"]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/staff/:id", auth, requireAdmin, async (req, res, next) => {
  try {
    if (req.body.role !== undefined && String(req.user.id) === String(req.params.id)) {
      res.status(400).json({ error: "Cannot change your own role" });
      return;
    }

    if (req.body.email) {
      const existing = await query(
        "SELECT 1 FROM staff_users WHERE email = $1 AND id != $2",
        [req.body.email, req.params.id]
      );
      if (existing.rows.length > 0) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
    }

    const allowed = ["name", "email", "role"];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx}`);
        values.push(req.body[field]);
        idx += 1;
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE staff_users SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, name, email, role, created_at`,
      values
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/staff/:id", auth, requireAdmin, async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const { rows } = await query(
      "DELETE FROM staff_users WHERE id = $1 RETURNING id",
      [req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    res.json({ message: "Deleted" });
  } catch (error) {
    next(error);
  }
});

export default router;
