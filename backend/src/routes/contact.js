import express from "express";
import rateLimit from "express-rate-limit";
import { query } from "../db/pool.js";
import { sendContactNotification } from "../lib/emailService.js";

const router = express.Router();

// Public, unauthenticated, and it writes to the database, so it is rate
// limited per IP like the diagnosis and booking routes.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.CONTACT_RATE_LIMIT) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please wait a moment and try again." },
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Column widths from migration 005. Rejected with a message rather than left
// for Postgres to abort with a 22001.
const MAX_NAME = 255;
const MAX_EMAIL = 255;
const MAX_PHONE = 50;
const MAX_MESSAGE = 5000;

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fieldError(field, error, fieldMessage) {
  return { field, error, fieldMessage };
}

function validateBody(body) {
  const name = asTrimmedString(body.name);
  if (!name) {
    return fieldError("name", "Your name is required.", "Required.");
  }
  if (name.length > MAX_NAME) {
    return fieldError("name", "That name is too long.", "Too long.");
  }

  const email = asTrimmedString(body.email);
  if (!email || !EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL) {
    return fieldError(
      "email",
      "Enter a valid email address.",
      "Enter a valid email address."
    );
  }

  // Phone is optional, but a supplied one has to be plausible - the same rule
  // the booking route applies.
  const phone = asTrimmedString(body.phone);
  if (phone && (phone.replace(/\D/g, "").length < 7 || phone.length > MAX_PHONE)) {
    return fieldError(
      "phone",
      "Enter a valid phone number.",
      "Enter a valid phone number."
    );
  }

  const message = asTrimmedString(body.message);
  if (!message) {
    return fieldError("message", "A message is required.", "Required.");
  }
  if (message.length > MAX_MESSAGE) {
    return fieldError(
      "message",
      `Please keep your message under ${MAX_MESSAGE} characters.`,
      "Too long."
    );
  }

  return { valid: { name, email, phone: phone || null, message } };
}

/**
 * POST /api/contact
 *
 * Body: { name, email, phone?, message }
 *
 * Saves the message, then notifies the shop by email if that is configured.
 * The insert is what decides success: the notification is fire and forget, so
 * a customer never sees a failure because the shop's mail server is down.
 */
router.post("/", limiter, async (req, res, next) => {
  const result = validateBody(req.body || {});

  if (!result.valid) {
    res.status(400).json({
      error: result.error,
      field: result.field,
      fieldMessage: result.fieldMessage,
    });
    return;
  }

  const message = result.valid;

  try {
    const { rows } = await query(
      `INSERT INTO contact_messages (name, email, phone, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [message.name, message.email, message.phone, message.message]
    );

    // The shop's own address, used when SHOP_EMAIL is not set.
    let shopEmail = null;
    try {
      const { rows: settings } = await query(
        `SELECT email FROM shop_settings ORDER BY id LIMIT 1`
      );
      shopEmail = settings[0]?.email || null;
    } catch (error) {
      console.error("Could not read the shop email address:", error.message);
    }

    sendContactNotification(message, shopEmail).catch((error) => {
      console.error("Contact notification email failed:", error.message);
    });

    res.status(201).json({
      success: true,
      message: "Your message has been sent.",
      id: rows[0].id,
      created_at: rows[0].created_at,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
