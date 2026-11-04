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
export const DEFAULT_SHOP_TIME_ZONE = "America/New_York";

const CONFIGURED_SHOP_TIME_ZONE =
  process.env.SHOP_TIME_ZONE || DEFAULT_SHOP_TIME_ZONE;

// Zones that genuinely sit at UTC+0 all year. The divergence probe below would
// otherwise flag them as a broken runtime.
const UTC_EQUIVALENT_ZONES = new Set(
  [
    "UTC",
    "GMT",
    "Etc/UTC",
    "Etc/GMT",
    "Etc/Greenwich",
    "Universal",
    "Zulu",
    "Africa/Abidjan",
    "Atlantic/Reykjavik",
  ].map((zone) => zone.toLowerCase())
);

const SHOP_TIME_ZONE_PARTS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Build the shop's date formatter, refusing to start if the runtime cannot
 * actually honour the requested zone.
 *
 * A container without IANA timezone data is the dangerous case: every slot
 * comparison silently shifts by the UTC offset, so "has this time passed"
 * quietly produces wrong answers instead of erroring. Node normally throws a
 * RangeError for a zone it cannot resolve, but that is not guaranteed across
 * every build and ICU configuration, so this checks the result as well as the
 * construction, and throws rather than serving availability it cannot trust.
 */
function buildShopFormatter(timeZone) {
  if (typeof Intl?.DateTimeFormat !== "function") {
    throw new Error(
      "This Node build has no Intl.DateTimeFormat, so the shop's timezone " +
        "cannot be resolved. Availability would silently use UTC. Use a Node " +
        "build with full ICU."
    );
  }

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      ...SHOP_TIME_ZONE_PARTS,
    });
  } catch (error) {
    throw new Error(
      `Shop timezone "${timeZone}" could not be resolved by this runtime ` +
        `(${error.message}). Set SHOP_TIME_ZONE to a valid IANA zone and make ` +
        "sure the image ships timezone data (tzdata / full-icu)."
    );
  }

  // A runtime missing zone data can accept the name and then resolve it to
  // UTC. ICU also legitimately canonicalises aliases (Etc/UTC -> UTC,
  // Asia/Calcutta -> Asia/Kolkata), so only a slide to UTC from a zone that is
  // not itself UTC counts as a failure.
  const resolved = formatter.resolvedOptions().timeZone;
  if (!resolved) {
    throw new Error(
      `Shop timezone "${timeZone}" resolved to no zone at all. This runtime is ` +
        "missing timezone data, and availability would be computed against the " +
        "wrong clock."
    );
  }
  if (
    !UTC_EQUIVALENT_ZONES.has(timeZone.toLowerCase()) &&
    UTC_EQUIVALENT_ZONES.has(resolved.toLowerCase())
  ) {
    throw new Error(
      `Shop timezone "${timeZone}" resolved to "${resolved}" instead. This ` +
        "runtime is missing timezone data, and availability would be computed " +
        "against the wrong clock."
    );
  }

  // Checked against the resolved name, because supportedValuesOf lists only
  // canonical zones. It also omits UTC and the Etc/* zones entirely by spec,
  // so a zone that resolves to UTC is exempt from this check and is covered by
  // the UTC-divergence probe below instead.
  if (
    !UTC_EQUIVALENT_ZONES.has(resolved.toLowerCase()) &&
    typeof Intl.supportedValuesOf === "function" &&
    !Intl.supportedValuesOf("timeZone").some(
      (zone) => zone.toLowerCase() === resolved.toLowerCase()
    )
  ) {
    throw new Error(
      `Shop timezone "${timeZone}" (resolved as "${resolved}") is not in this ` +
        "runtime's timezone database. The image is missing tzdata / full ICU."
    );
  }

  // Last net: a runtime that renders every zone as UTC. Probe midwinter and
  // midsummer so a zone that merely happens to sit at UTC+0 for half the year
  // (Europe/London, say) is not mistaken for a broken runtime.
  if (!UTC_EQUIVALENT_ZONES.has(timeZone.toLowerCase())) {
    const utcFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      ...SHOP_TIME_ZONE_PARTS,
    });
    const probes = [
      new Date("2026-01-15T12:00:00Z"),
      new Date("2026-07-15T12:00:00Z"),
    ];
    if (
      probes.every((probe) => formatter.format(probe) === utcFormatter.format(probe))
    ) {
      throw new Error(
        `Shop timezone "${timeZone}" renders identically to UTC all year, so ` +
          "this runtime is falling back to UTC instead of applying the zone. " +
          "The image is missing timezone data."
      );
    }
  }

  return formatter;
}

// Validated once, at import, so a container without timezone data fails at
// boot with the message above rather than quietly serving wrong availability.
const shopFormatter = buildShopFormatter(CONFIGURED_SHOP_TIME_ZONE);

export const SHOP_TIME_ZONE = CONFIGURED_SHOP_TIME_ZONE;

// Whether the zone came from the environment or from the built-in default.
// Logged at startup so production never leaves it ambiguous.
export const SHOP_TIME_ZONE_SOURCE = process.env.SHOP_TIME_ZONE
  ? "SHOP_TIME_ZONE environment variable"
  : "built-in default (SHOP_TIME_ZONE is not set)";

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
  const parts = shopFormatter
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
