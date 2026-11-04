import { ApiError, getJson, postJson, toCamel } from './client.js'

// Thrown when the chosen slot filled up between the customer loading the time
// picker and pressing Confirm. Callers check this to show "taken" rather than
// "something went wrong".
export const SLOT_TAKEN = 'slot_taken'

function buildServiceIdsParam(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return ''
  }
  return `&serviceIds=${encodeURIComponent(serviceIds.join(','))}`
}

/**
 * Open time slots for one day, for the services the customer picked.
 *
 * Returns [{ date, time, isAvailable }] — one entry per slot on the shop's
 * schedule, so taken times can be shown greyed out rather than vanishing.
 * An empty array means the shop is closed that day.
 *
 * The backend decides availability: the shop's real hours for that weekday,
 * how long the selected services take, collisions with existing bookings, and
 * whether the slot has already passed when the date is today.
 */
export async function getAvailability(dateString, serviceIds = []) {
  const payload = await getJson(
    `/api/availability/day?date=${encodeURIComponent(dateString)}${buildServiceIdsParam(serviceIds)}`,
  )
  return toCamel(payload)
}

/**
 * Which days of a calendar month have at least one open slot.
 *
 * `month` is 1-12. Returns [{ date, isOpen, isAvailable, openSlotCount }] for
 * every day of the month: isOpen is false when the shop does not open that
 * weekday at all, and isAvailable is false when nothing is left to book
 * (closed, fully booked, or the whole day is in the past).
 */
export async function getMonthAvailability(year, month, serviceIds = []) {
  const payload = await getJson(
    `/api/availability/month?year=${year}&month=${month}${buildServiceIdsParam(serviceIds)}`,
  )
  return toCamel(payload).days
}

/**
 * Save an appointment.
 *
 * Takes the same payload shape as before:
 *   { serviceIds, vehicle: { make, model, year },
 *     contact: { fullName, email, phone }, date, time, diagnosisRequestId? }
 *
 * Resolves to the created booking, camelCased, including referenceId,
 * serviceIds, vehicle, contact, date and time.
 *
 * Rejects with an ApiError. When the slot was taken in the meantime the error's
 * `reason` is SLOT_TAKEN, which is a different situation from a validation
 * failure and worth a different message.
 */
export async function createBooking(payload) {
  try {
    return toCamel(await postJson('/api/bookings', payload))
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new ApiError(error.message, {
        status: 409,
        field: error.field,
        reason: SLOT_TAKEN,
      })
    }
    throw error
  }
}
