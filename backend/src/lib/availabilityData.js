// Database-backed helpers shared by GET /api/availability/* and
// POST /api/bookings, so the two endpoints resolve the shop's settings, the
// requested services' total duration, and the day's existing appointments
// through exactly one implementation.
//
// Every function takes an optional `executor` — a pg Pool or a checked-out
// Client. Passing the transaction's client lets POST /api/bookings run these
// reads inside its transaction (and therefore under its locks); omitting it
// falls back to the pool for ordinary read-only requests.

import { pool } from "../db/pool.js";
import { BLOCKING_STATUSES, timeToMinutes } from "./availability.js";

function runner(executor) {
  return executor || pool;
}

export async function loadShopSettings(executor) {
  const { rows } = await runner(executor).query(
    `SELECT hours_json, appointment_duration_minutes, max_concurrent_appointments
       FROM shop_settings
      LIMIT 1`
  );
  return rows[0] || null;
}

/**
 * Normalise a service-id list from either a query string or a JSON body.
 *
 * Accepts "1,2", ["1","2"], [1, 2] or "1". Returns a de-duplicated array of
 * positive integers, or null when the input is present but malformed, so the
 * caller can answer 400 rather than guess.
 */
export function parseServiceIds(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return [];
  }

  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) =>
      typeof value === "string" ? value.split(",") : [value]
    )
    .map((value) => String(value).trim())
    .filter(Boolean);

  const ids = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const id = Number(part);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return null;
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * How long the requested appointment takes, in minutes.
 *
 * A booking can include several services, so the durations add up: picking an
 * oil change (30) and a brake repair (90) needs a 120-minute window, and a
 * slot that cannot fit that is not open. With no services named we fall back to
 * the shop's configured slot length, which is what the month view uses when the
 * customer has not chosen services yet.
 *
 * @returns {{ durationMinutes?: number, services?: Array, error?: string }}
 */
export async function resolveDurationMinutes(serviceIds, settings, executor) {
  if (serviceIds.length === 0) {
    return {
      durationMinutes: settings.appointment_duration_minutes,
      services: [],
    };
  }

  const { rows } = await runner(executor).query(
    `SELECT id, name, est_duration_minutes
       FROM services
      WHERE id = ANY($1::int[])
        AND is_active = true`,
    [serviceIds]
  );

  const found = new Map(rows.map((row) => [row.id, row]));
  const unknown = serviceIds.filter((id) => !found.has(id));

  if (unknown.length > 0) {
    return {
      error: `Unknown or inactive service id(s): ${unknown.join(", ")}.`,
    };
  }

  // Keep the caller's order so the confirmation screen lists services the way
  // the customer picked them.
  const services = serviceIds.map((id) => found.get(id));

  return {
    durationMinutes: services.reduce(
      (total, service) => total + service.est_duration_minutes,
      0
    ),
    services,
  };
}

/**
 * Existing appointments that still occupy their slot, as minute intervals
 * keyed by date. Cancelled bookings are excluded, so cancelling frees the time.
 *
 * `forUpdate` takes a row-level lock on the matching rows, which POST
 * /api/bookings uses to hold the day's appointments still between its
 * availability re-check and its insert.
 */
export async function loadBookingsByDate(
  fromDateKey,
  toDateKey,
  { executor, forUpdate = false } = {}
) {
  const { rows } = await runner(executor).query(
    `SELECT to_char(appointment_date, 'YYYY-MM-DD') AS date_key,
            appointment_time::text                  AS appointment_time,
            duration_minutes
       FROM bookings
      WHERE appointment_date BETWEEN $1::date AND $2::date
        AND status = ANY($3::varchar[])
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [fromDateKey, toDateKey, BLOCKING_STATUSES]
  );

  const byDate = new Map();
  for (const row of rows) {
    const start = timeToMinutes(row.appointment_time);
    const list = byDate.get(row.date_key) || [];
    list.push({ start, end: start + row.duration_minutes });
    byDate.set(row.date_key, list);
  }
  return byDate;
}
