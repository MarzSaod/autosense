import mockDiagnosticCodes from '../mocks/diagnosticCodes.js'
import mockServices from '../mocks/services.js'
import { API_BASE_URL, USE_MOCKS, toCamel, delay } from './client.js'

function generateId() {
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function createDiagnosisRequest({ description = '', make, model, year } = {}) {
  if (!USE_MOCKS) {
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
      matchedIssue: data.matchedCode?.description ?? 'General inspection recommended',
    }
  }

  await delay()

  const normalized = description.toLowerCase()
  const vehicleLabel = [year, make, model].filter(Boolean).join(' ')

  let bestMatch = null
  let bestScore = 0

  mockDiagnosticCodes.forEach((entry) => {
    const score = entry.keywords.filter((keyword) => normalized.includes(keyword)).length
    if (score > 0 && (!bestMatch || score > bestScore)) {
      bestMatch = entry
      bestScore = score
    }
  })

  if (!bestMatch) {
    const fallbackService = mockServices.find((service) => service.id === 8)
    return {
      id: generateId(),
      description,
      matchedCode: null,
      matchedIssue: 'General inspection recommended',
      summary: vehicleLabel
        ? `For your ${vehicleLabel}, the description could not be narrowed down to a specific issue, so a shop inspection is the next step.`
        : 'The description could not be narrowed down to a specific issue, so a shop inspection is the next step.',
      estCostMin: fallbackService.est_price_min,
      estCostMax: fallbackService.est_price_max,
      estTimeMinHours: fallbackService.est_duration_minutes / 60,
      estTimeMaxHours: fallbackService.est_duration_minutes / 60,
      suggestedServiceId: fallbackService.id,
      confidence: 'low',
    }
  }

  const summary = vehicleLabel
    ? `For your ${vehicleLabel}, this looks like it could be related to ${bestMatch.description.toLowerCase()} (diagnostic code ${bestMatch.code}). Common causes include ${bestMatch.common_causes.toLowerCase()}.`
    : `Based on your description, this looks like it could be related to ${bestMatch.description.toLowerCase()} (diagnostic code ${bestMatch.code}). Common causes include ${bestMatch.common_causes.toLowerCase()}.`

  return toCamel({
    id: generateId(),
    description,
    matched_code: bestMatch.code,
    matched_issue: bestMatch.description,
    summary,
    est_cost_min: bestMatch.est_cost_min,
    est_cost_max: bestMatch.est_cost_max,
    est_time_min_hours: bestMatch.est_time_min_hours,
    est_time_max_hours: bestMatch.est_time_max_hours,
    suggested_service_id: bestMatch.suggested_service_id,
    confidence: bestScore >= 2 ? 'high' : 'medium',
  })
}
