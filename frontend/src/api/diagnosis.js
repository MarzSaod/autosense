import { API_BASE_URL, toCamel } from './client.js'

export async function createDiagnosisRequest({ description = '', make, model, year } = {}) {
  const response = await fetch(`${API_BASE_URL}/api/diagnosis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, make, model, year }),
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error || 'Something went wrong.')
  }

  const data = toCamel(payload)

  return {
    ...data,
    matchedIssue:
      data.matchedCode?.description ??
      data.matchedService?.name ??
      'General inspection recommended',
  }
}
