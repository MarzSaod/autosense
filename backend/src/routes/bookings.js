import express from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db/pool.js";
import {
  SLOT_REASONS,
  evaluateSlot,
  isValidDateKey,
  minutesToTime,
  timeToMinutes,
} from "../lib/availability.js";
import {
  loadBookingsByDate,
  loadShopSettings,
  parseServiceIds,
  resolveDurationMinutes,
} from "../lib/availabilityData.js";
import {
  isEmailConfigured,
  sendBookingConfirmation,
} from "../lib/emailService.js";

const router = express.Router();

// Same approach as the diagnosis endpoint: this is a public, unauthenticated
// route that writes to the database, so it is rate limited per IP. The limit is
// env-overridable only so the test harness can fire a batch of requests in one
// go; it defaults to the production value.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.BOOKING_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please wait a moment and try again." },
});

// Lookup is keyed on a reference id plus the email the booking was made with,
// which is the only credential a customer has. That pair is guessable in
// principle, so the route gets its own, tighter limit to make walking the
// reference space impractical.
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.BOOKING_LOOKUP_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please wait a moment and try again." },
});

const MIN_VEHICLE_YEAR = 1980;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Error wording. Where a rule also exists on the Booking page, `fieldMessage`
// is that page's exact text, so a field-level message rendered from the server
// reads identically to the client-side one; `error` is the standalone sentence
// for the single top-level message the frontend surfaces today.
function fieldError(field, error, fieldMessage) {
  return { field, error, fieldMessage };
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate everything that does not require the shop's schedule.
 * Returns { valid: {...} } when the body is acceptable, otherwise the 400 parts.
 */
function validateBody(body) {
  const vehicle = body.vehicle || {};
  const contact = body.contact || {};

  const serviceIds = parseServiceIds(body.serviceIds);
  if (serviceIds === null) {
    return fieldError(
      "serviceIds",
      "Service ids must be positive integers.",
      "Pick at least one service."
    );
  }
  if (serviceIds.length === 0) {
    return fieldError(
      "serviceIds",
      "Pick at least one service.",
      "Pick at least one service."
    );
  }

  const make = asTrimmedString(vehicle.make);
  if (!make) {
    return fieldError("make", "Vehicle make is required.", "Required.");
  }

  const model = asTrimmedString(vehicle.model);
  if (!model) {
    return fieldError("model", "Vehicle model is required.", "Required.");
  }

  // The form submits the year as a string; accept a number too, but hold to
  // the Booking page's rule of exactly four digits in range.
  const rawYear = asTrimmedString(
    typeof vehicle.year === "number" ? String(vehicle.year) : vehicle.year
  );
  const maxVehicleYear = new Date().getFullYear() + 1;
  if (
    !/^\d{4}$/.test(rawYear) ||
    Number(rawYear) < MIN_VEHICLE_YEAR ||
    Number(rawYear) > maxVehicleYear
  ) {
    return fieldError(
      "year",
      `Enter a valid year between ${MIN_VEHICLE_YEAR} and ${maxVehicleYear}.`,
      "Enter a valid year."
    );
  }

  const fullName = asTrimmedString(contact.fullName);
  if (!fullName) {
    return fieldError("fullName", "Your name is required.", "Required.");
  }

  const email = asTrimmedString(contact.email);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return fieldError(
      "email",
      "Enter a valid email address.",
      "Enter a valid email address."
    );
  }

  // Phone is optional, but a supplied one has to be plausible.
  const phone = asTrimmedString(contact.phone);
  if (phone && phone.replace(/\D/g, "").length < 7) {
    return fieldError(
      "phone",
      "Enter a valid phone number.",
      "Enter a valid phone number."
    );
  }

  if (!isValidDateKey(body.date)) {
    return fieldError(
      "date",
      "A valid appointment date (YYYY-MM-DD) is required.",
      "Pick a date."
    );
  }

  if (
    typeof body.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)
  ) {
    return fieldError(
      "time",
      "A valid appointment time (HH:MM) is required.",
      "Pick a time."
    );
  }

  let diagnosisRequestId = null;
  if (
    body.diagnosisRequestId !== undefined &&
    body.diagnosisRequestId !== null &&
    body.diagnosisRequestId !== ""
  ) {
    const parsed = Number(body.diagnosisRequestId);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return fieldError(
        "diagnosisRequestId",
        "diagnosisRequestId must be a positive integer.",
        "Something went wrong with your estimate."
      );
    }
    diagnosisRequestId = parsed;
  }

  return {
    valid: {
      serviceIds,
      make,
      model,
      year: Number(rawYear),
      fullName,
      email,
      phone: phone || null,
      date: body.date,
      time: body.time,
      diagnosisRequestId,
    },
  };
}

// AS- plus six random uppercase letters and digits, matching the AS- prefix the
// seeded availability test rows used. Those rows are AS-TEST-A through
// AS-TEST-E; a fixed six-character suffix can never reproduce that longer
// pattern, so real bookings stay distinguishable from the test ones.
const REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomReferenceId() {
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix +=
      REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return `AS-${suffix}`;
}

/**
 * A reference id not already in use. 36^6 is about 2.2 billion, so a collision
 * is vanishingly unlikely, but the column is UNIQUE and a duplicate would abort
 * the transaction, so retry rather than gamble. Runs on the transaction's
 * client so the check sees the same snapshot as the insert.
 */
async function generateReferenceId(client, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = randomReferenceId();
    const { rows } = await client.query(
      `SELECT 1 FROM bookings WHERE reference_id = $1`,
      [candidate]
    );
    if (rows.length === 0) {
      return candidate;
    }
  }
  throw new Error(
    `Could not generate an unused booking reference after ${attempts} attempts.`
  );
}

/**
 * One booking with its services, found by reference id and email.
 *
 * The email comparison is case-insensitive: a customer who typed
 * "Sam@Example.com" at booking time will not type it the same way again.
 * Returns null when the pair matches nothing, which both callers answer as a
 * 404 - deliberately the same response whether the reference does not exist or
 * the email does not go with it, so this cannot be used to discover which
 * reference ids are real.
 */
async function loadBookingForCustomer(referenceId, email, executor = pool) {
  const { rows } = await executor.query(
    `SELECT b.id,
            b.reference_id,
            b.status,
            to_char(b.appointment_date, 'YYYY-MM-DD') AS appointment_date,
            b.appointment_time::text                  AS appointment_time,
            b.duration_minutes,
            b.customer_name,
            b.customer_email,
            b.customer_phone,
            b.vehicle_make,
            b.vehicle_model,
            b.vehicle_year,
            b.diagnosis_request_id,
            b.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', s.id,
                  'name', s.name,
                  'price_min', s.est_price_min,
                  'price_max', s.est_price_max,
                  'duration', s.est_duration_minutes
                )
                ORDER BY s.id
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'
            ) AS services
       FROM bookings b
       LEFT JOIN booking_services bs ON bs.booking_id = b.id
       LEFT JOIN services s          ON s.id = bs.service_id
      WHERE b.reference_id = $1
        AND lower(b.customer_email) = lower($2)
      GROUP BY b.id`,
    [referenceId, email]
  );

  return rows[0] || null;
}

/** The lookup response shape. */
function serializeBooking(row) {
  return {
    reference_id: row.reference_id,
    status: row.status,
    appointment_date: row.appointment_date,
    // Trim Postgres's "HH:MM:SS" back to the "HH:MM" the UI formats.
    appointment_time: minutesToTime(timeToMinutes(row.appointment_time)),
    vehicle: {
      make: row.vehicle_make,
      model: row.vehicle_model,
      year: row.vehicle_year,
    },
    contact: {
      full_name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    services: row.services,
    total_duration: row.duration_minutes,
    created_at: row.created_at,
  };
}

function readLookupParams(source) {
  const referenceId = asTrimmedString(source.referenceId).toUpperCase();
  const email = asTrimmedString(source.email);

  if (!referenceId) {
    return { error: "A booking reference number is required.", field: "referenceId" };
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address.", field: "email" };
  }

  return { valid: { referenceId, email } };
}

/**
 * GET /api/bookings/lookup?referenceId=AS-XXXXXX&email=...
 *
 * How a customer finds their appointment again after closing the tab. Both
 * parts must match; 404 when they do not.
 */
router.get("/lookup", lookupLimiter, async (req, res, next) => {
  const params = readLookupParams(req.query || {});

  if (!params.valid) {
    res.status(400).json({ error: params.error, field: params.field });
    return;
  }

  try {
    const row = await loadBookingForCustomer(
      params.valid.referenceId,
      params.valid.email
    );

    if (!row) {
      res.status(404).json({
        error: "No booking found with that reference number and email.",
      });
      return;
    }

    res.json({ booking: serializeBooking(row) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings
 *
 * Body (exactly what the Booking page already sends):
 *   { serviceIds: [1, 2],
 *     vehicle: { make, model, year },
 *     contact: { fullName, email, phone },
 *     date: "YYYY-MM-DD", time: "HH:MM",
 *     diagnosisRequestId?: number }
 *
 * 400 - the body or the requested time is invalid (closed, past, off-grid).
 * 409 - the slot was open when the customer loaded it and has since filled up.
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

  const booking = result.valid;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialise every booking attempt for this calendar date. The row-level
    // lock below holds the day's *existing* appointments still, but on a date
    // with no bookings yet there are no rows to lock, so two simultaneous
    // requests for the last free bay would both read "open" and both insert.
    // A transaction-scoped advisory lock keyed on the date closes that gap:
    // the second request waits here until the first commits, then re-reads the
    // day and sees the slot taken.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `booking:${booking.date}`,
    ]);

    const settings = await loadShopSettings(client);
    if (!settings) {
      await client.query("ROLLBACK");
      res.status(503).json({ error: "Shop settings have not been set up." });
      return;
    }

    // Same helper the day-availability endpoint uses: this both validates the
    // service ids and produces the duration as the sum across them.
    const resolved = await resolveDurationMinutes(
      booking.serviceIds,
      settings,
      client
    );
    if (resolved.error) {
      await client.query("ROLLBACK");
      res.status(400).json({
        error: resolved.error,
        field: "serviceIds",
        fieldMessage: "Pick at least one service.",
      });
      return;
    }

    if (booking.diagnosisRequestId !== null) {
      const { rows } = await client.query(
        `SELECT 1 FROM diagnosis_requests WHERE id = $1`,
        [booking.diagnosisRequestId]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: `Unknown diagnosis request id: ${booking.diagnosisRequestId}.`,
          field: "diagnosisRequestId",
          fieldMessage: "Something went wrong with your estimate.",
        });
        return;
      }
    }

    // Re-check availability from inside the transaction, with the day's
    // existing appointments row-locked, using the same evaluateSlot the
    // day-view endpoint maps over its grid. Whatever the customer's browser
    // believed when it rendered the time picker is irrelevant here.
    const bookingsByDate = await loadBookingsByDate(
      booking.date,
      booking.date,
      { executor: client, forUpdate: true }
    );

    const slot = evaluateSlot({
      dateKey: booking.date,
      settings,
      durationMinutes: resolved.durationMinutes,
      bookings: bookingsByDate.get(booking.date) || [],
      startMinutes: timeToMinutes(booking.time),
    });

    if (!slot.isAvailable) {
      await client.query("ROLLBACK");

      // Only a capacity clash is a race against other customers. A closed day,
      // a passed time or an off-grid time is a bad request.
      if (slot.reason === SLOT_REASONS.AT_CAPACITY) {
        res.status(409).json({
          error:
            "That time was just booked by someone else. Please pick another time.",
          field: "time",
          reason: slot.reason,
        });
        return;
      }

      const messages = {
        [SLOT_REASONS.CLOSED]: "The shop is closed on that date.",
        [SLOT_REASONS.OFF_GRID]:
          "That is not one of the shop's appointment times.",
        [SLOT_REASONS.PAST]: "That time has already passed.",
        [SLOT_REASONS.AFTER_CLOSE]:
          "The selected services would not finish before the shop closes.",
      };

      res.status(400).json({
        error: messages[slot.reason] || "That time is not available.",
        field: "time",
        fieldMessage: "Pick a time.",
        reason: slot.reason,
      });
      return;
    }

    const referenceId = await generateReferenceId(client);

    const { rows: inserted } = await client.query(
      `INSERT INTO bookings
         (reference_id, customer_name, customer_email, customer_phone,
          vehicle_make, vehicle_model, vehicle_year,
          appointment_date, appointment_time, duration_minutes,
          status, diagnosis_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::time, $10, 'pending', $11)
       RETURNING id, reference_id, status,
                 to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
                 appointment_time::text                  AS appointment_time,
                 duration_minutes, created_at`,
      [
        referenceId,
        booking.fullName,
        booking.email,
        booking.phone,
        booking.make,
        booking.model,
        booking.year,
        booking.date,
        booking.time,
        resolved.durationMinutes,
        booking.diagnosisRequestId,
      ]
    );

    const row = inserted[0];

    for (const service of resolved.services) {
      await client.query(
        `INSERT INTO booking_services (booking_id, service_id) VALUES ($1, $2)`,
        [row.id, service.id]
      );
    }

    // A booking that came from an estimate marks that estimate as converted.
    if (booking.diagnosisRequestId !== null) {
      await client.query(
        `UPDATE diagnosis_requests
            SET status = 'converted_to_booking'
          WHERE id = $1`,
        [booking.diagnosisRequestId]
      );
    }

    await client.query("COMMIT");

    const appointmentTime = minutesToTime(timeToMinutes(row.appointment_time));

    // Fire and forget, after the commit. The appointment is saved; the
    // customer should not wait on an SMTP handshake to hear that, and a mail
    // failure must not turn a successful booking into an error. sendBooking-
    // Confirmation never rejects, but the catch keeps an unexpected throw from
    // becoming an unhandled rejection.
    sendBookingConfirmation({
      referenceId: row.reference_id,
      fullName: booking.fullName,
      email: booking.email,
      date: row.appointment_date,
      time: appointmentTime,
      durationMinutes: row.duration_minutes,
      vehicle: {
        make: booking.make,
        model: booking.model,
        year: booking.year,
      },
      services: resolved.services.map((service) => ({ name: service.name })),
    }).catch((error) => {
      console.error("Booking confirmation email failed:", error.message);
    });

    // Shaped so the frontend's snake_case -> camelCase conversion produces
    // exactly the field names the confirmation screen already reads:
    // referenceId, serviceIds, vehicle.{year,make,model}, contact.email,
    // date and time.
    res.status(201).json({
      id: row.id,
      reference_id: row.reference_id,
      status: row.status,
      service_ids: resolved.services.map((service) => service.id),
      services: resolved.services.map((service) => ({
        id: service.id,
        name: service.name,
        est_duration_minutes: service.est_duration_minutes,
      })),
      vehicle: {
        make: booking.make,
        model: booking.model,
        year: booking.year,
      },
      contact: {
        full_name: booking.fullName,
        email: booking.email,
        phone: booking.phone,
      },
      date: row.appointment_date,
      // Trim Postgres's "HH:MM:SS" back to the "HH:MM" the UI formats.
      time: appointmentTime,
      duration_minutes: row.duration_minutes,
      // Whether a confirmation email is on its way, so the confirmation screen
      // can say "we've emailed you" only when that is true. Reports whether
      // mail is configured, not the eventual delivery result: the send is
      // deliberately not awaited.
      email_sent: isEmailConfigured(),
      diagnosis_request_id: booking.diagnosisRequestId,
      created_at: row.created_at,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback after failed booking failed:", rollbackError);
    }
    next(error);
  } finally {
    client.release();
  }
});

export default router;
