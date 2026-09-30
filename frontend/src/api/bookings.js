import mockShopSettings from '../mocks/shopSettings.js'
import mockBookedSlots from '../mocks/bookedSlots.js'
import { toCamel, delay } from './client.js'

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function buildTimeSlots(open, close, durationMinutes) {
  const slots = []
  const [openHour, openMinute] = open.split(':').map(Number)
  const [closeHour, closeMinute] = close.split(':').map(Number)
  const closeTotal = closeHour * 60 + closeMinute

  let current = openHour * 60 + openMinute
  while (current + durationMinutes <= closeTotal) {
    const hour = Math.floor(current / 60)
    const minute = current % 60
    slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    current += durationMinutes
  }
  return slots
}

function generateReferenceId() {
  return `AS-${Date.now().toString(36).toUpperCase()}`
}

const BOOKING_BUFFER_MINUTES = 60

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function getAvailability(dateString) {
  await delay()
  const date = parseDateString(dateString)
  const dayName = dayNames[date.getDay()]
  const hours = mockShopSettings.hours_json[dayName]

  if (!hours) {
    return []
  }

  const times = buildTimeSlots(hours.open, hours.close, mockShopSettings.appointment_duration_minutes)
  const now = new Date()
  const isToday = dateString === formatDateKey(now)
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + BOOKING_BUFFER_MINUTES

  return times.map((time) => {
    const bookedCount = mockBookedSlots.filter(
      (slot) => slot.date === dateString && slot.time === time,
    ).length
    const [hour, minute] = time.split(':').map(Number)
    const hasPassed = isToday && hour * 60 + minute < cutoffMinutes
    return toCamel({
      date: dateString,
      time,
      is_available: !hasPassed && bookedCount < mockShopSettings.max_concurrent_appointments,
    })
  })
}

export async function createBooking(payload) {
  await delay()
  return toCamel({
    ...payload,
    reference_id: generateReferenceId(),
    status: 'pending',
  })
}
