// Shared availability logic for the month-view and day-view endpoints.
//
// Everything in here works in shop-local wall-clock minutes-from-midnight.
// shop_settings.hours_json holds wall-clock strings ("09:00"), and bookings
// store a plain date + time in the same frame, so no timezone conversion is
// needed to compare them. The one place a timezone genuinely matters is
// deciding what "now" is when blocking slots that have already passed today,
// which is what shopNow() below is for.

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// How far ahead of the current time a slot must start to still be bookable
// today. Matches the buffer the frontend used to apply on its own.
export const BOOKING_BUFFER_MINUTES = 60;

// The shop is a single physical location in State College, PA. The server may
// run anywhere (Railway runs in UTC), so "today" and "has this time passed"
// must be evaluated in the shop's own timezone, not the server's.
const SHOP_TIME_ZONE = process.env.SHOP_TIME_ZONE || "America/New_York";

// Bookings in these states still occupy their slot. Cancelled ones free it up.
const BLOCKING_STATUSES = ["pending", "confirmed", "completed"];

export { BLOCKING_STATUSES };

export function pad2(value) {
  return String(value).padStart(2, "0");
}

// "09:30" or "09:30:00" -> 570
export function timeToMinutes(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

// 570 -> "09:30"
export function minutesToTime(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

export function formatDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// The current date and time as the shop experiences it.
export function shopNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  // Some ICU builds render midnight as hour "24" under hour12: false.
  const hour = Number(parts.hour) % 24;

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

// Day of week for a YYYY-MM-DD string, read as a calendar date rather than an
// instant, so the server's own timezone cannot shift it by a day.
export function dayNameForDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Hours for one weekday out of hours_json. A missing key or an explicit null
// both mean the shop is closed that day.
export function hoursForDateKey(hoursJson, dateKey) {
  const hours = (hoursJson || {})[dayNameForDateKey(dateKey)];
  if (!hours || !hours.open || !hours.close) {
    return null;
  }
  const openMinutes = timeToMinutes(hours.open);
  const closeMinutes = timeToMinutes(hours.close);
  if (!(closeMinutes > openMinutes)) {
    return null;
  }
  return { openMinutes, closeMinutes };
}

// The candidate start times for a day: from opening, stepped by the shop's
// configured appointment slot length. Which of them are actually bookable
// depends on the requested duration, so the grid itself is duration-agnostic —
// this keeps the slot labels stable (09:00, 10:00, ...) no matter which
// services the customer picked.
export function buildSlotGrid({ openMinutes, closeMinutes }, stepMinutes) {
  const slots = [];
  for (
    let start = openMinutes;
    start < closeMinutes;
    start += Math.max(stepMinutes, 1)
  ) {
    slots.push(start);
  }
  return slots;
}

// True when an appointment of `durationMinutes` starting at `startMinutes`
// would leave fewer than `capacity` parallel bays free at any point while it
// runs. Bookings are [start, start + duration) half-open intervals, so an
// appointment ending exactly when another begins is not a collision.
function exceedsCapacity(startMinutes, durationMinutes, bookings, capacity) {
  const endMinutes = startMinutes + durationMinutes;

  // Overlap count can only change at an existing booking's start, so checking
  // the candidate's own start plus every booking start inside it is enough.
  const probes = [startMinutes];
  for (const booking of bookings) {
    if (booking.start > startMinutes && booking.start < endMinutes) {
      probes.push(booking.start);
    }
  }

  for (const probe of probes) {
    let overlapping = 0;
    for (const booking of bookings) {
      if (booking.start <= probe && booking.end > probe) {
        overlapping += 1;
      }
    }
    if (overlapping + 1 > capacity) {
      return true;
    }
  }

  return false;
}

// Why a slot is not bookable. The day-view endpoint only needs the boolean,
// but the create-booking endpoint has to tell these apart: a time that is
// closed, past or off-grid is a bad request from the client, whereas a slot
// that was open when the customer loaded the page and has since filled up is a
// conflict, not a client error.
export const SLOT_REASONS = {
  CLOSED: "closed",
  OFF_GRID: "off_grid",
  PAST: "past",
  AFTER_CLOSE: "after_close",
  AT_CAPACITY: "at_capacity",
};

/**
 * Decide whether one specific start time is bookable.
 *
 * This is the single source of truth for slot availability: the day-view
 * endpoint maps it over the whole grid, and POST /api/bookings calls it once
 * for the requested time inside its transaction. Neither one reimplements any
 * part of the rule.
 *
 * @param {string} dateKey          YYYY-MM-DD, shop-local calendar date.
 * @param {object} settings         shop_settings row.
 * @param {number} durationMinutes  Total length of the requested appointment.
 * @param {Array}  bookings         [{ start, end }] in minutes-from-midnight.
 * @param {number} startMinutes     Candidate start, minutes from midnight.
 * @returns {{ isAvailable: boolean, reason: string|null }}
 */
export function evaluateSlot({
  dateKey,
  settings,
  durationMinutes,
  bookings,
  startMinutes,
}) {
  const hours = hoursForDateKey(settings.hours_json, dateKey);

  if (!hours) {
    return { isAvailable: false, reason: SLOT_REASONS.CLOSED };
  }

  // Appointments may only begin on the shop's own slot boundaries, so a
  // hand-crafted request for 09:17 is rejected rather than quietly accepted.
  const grid = buildSlotGrid(hours, settings.appointment_duration_minutes);
  if (!grid.includes(startMinutes)) {
    return { isAvailable: false, reason: SLOT_REASONS.OFF_GRID };
  }

  const now = shopNow();
  const isPastDate = dateKey < now.dateKey;
  const isToday = dateKey === now.dateKey;

  // A date in the past is entirely gone; today is cut off at the current time
  // plus the booking buffer.
  if (isPastDate || (isToday && startMinutes < now.minutes + BOOKING_BUFFER_MINUTES)) {
    return { isAvailable: false, reason: SLOT_REASONS.PAST };
  }

  // Would the appointment run past closing time?
  if (startMinutes + durationMinutes > hours.closeMinutes) {
    return { isAvailable: false, reason: SLOT_REASONS.AFTER_CLOSE };
  }

  const capacity = Math.max(settings.max_concurrent_appointments || 1, 1);
  if (exceedsCapacity(startMinutes, durationMinutes, bookings, capacity)) {
    return { isAvailable: false, reason: SLOT_REASONS.AT_CAPACITY };
  }

  return { isAvailable: true, reason: null };
}

/**
 * Open time slots for a single day.
 *
 * @param {string}  dateKey          YYYY-MM-DD, shop-local calendar date.
 * @param {object}  settings         shop_settings row.
 * @param {number}  durationMinutes  Total length of the requested appointment.
 * @param {Array}   bookings         [{ start, end }] in minutes-from-midnight.
 * @returns {Array} [{ date, time, is_available }] — every slot on the grid,
 *                  flagged, so the UI can grey out taken times rather than
 *                  having them silently disappear.
 */
export function computeDaySlots({
  dateKey,
  settings,
  durationMinutes,
  bookings,
}) {
  const hours = hoursForDateKey(settings.hours_json, dateKey);

  // Closed that day: no grid at all, which the frontend renders as "no times".
  if (!hours) {
    return [];
  }

  return buildSlotGrid(hours, settings.appointment_duration_minutes).map(
    (startMinutes) => ({
      date: dateKey,
      time: minutesToTime(startMinutes),
      is_available: evaluateSlot({
        dateKey,
        settings,
        durationMinutes,
        bookings,
        startMinutes,
      }).isAvailable,
    })
  );
}
