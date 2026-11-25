import { API_BASE_URL, toCamel } from './client.js'

export async function lookupBooking(email, referenceId) {
  const params = new URLSearchParams({ email, reference_id: referenceId })
  const response = await fetch(`${API_BASE_URL}/api/bookings/lookup?${params}`)

  if (response.status === 404) return null

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Something went wrong.')
  }

  return toCamel(payload)
}
