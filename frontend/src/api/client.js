export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const USE_MOCKS = false

export async function getJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    // An ApiError rather than a bare Error so callers can tell "not found"
    // from "something went wrong" - the booking lookup needs that difference.
    throw new ApiError(payload?.error || 'Something went wrong.', {
      status: response.status,
      field: payload?.field,
      fieldMessage: payload?.fieldMessage,
      reason: payload?.reason,
    })
  }

  return payload
}

/**
 * An error carrying the HTTP status and the structured parts of the backend's
 * error payload, so callers can tell a validation failure (400) from a slot
 * that was taken while the customer was filling in the form (409).
 */
export class ApiError extends Error {
  constructor(message, { status, field, fieldMessage, reason } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
    this.fieldMessage = fieldMessage
    this.reason = reason
  }
}

export async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(payload?.error || 'Something went wrong.', {
      status: response.status,
      field: payload?.field,
      fieldMessage: payload?.fieldMessage,
      reason: payload?.reason,
    })
  }

  return payload
}

export function delay() {
  const ms = 300 + Math.random() * 300
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toCamelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())
}

export function toCamel(input) {
  if (Array.isArray(input)) {
    return input.map((item) => toCamel(item))
  }
  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.keys(input).reduce((acc, key) => {
      acc[toCamelKey(key)] = toCamel(input[key])
      return acc
    }, {})
  }
  return input
}
