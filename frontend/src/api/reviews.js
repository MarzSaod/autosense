import { getJson, toCamel } from './client.js'

export async function getReviews() {
  const payload = await getJson('/api/reviews')
  return toCamel(payload.reviews)
}

export async function getFeaturedReviews() {
  const reviews = await getReviews()
  return reviews.filter((review) => review.isFeatured)
}

export async function getRatingSummary() {
  const payload = await getJson('/api/reviews')
  // The endpoint names the review count "count"; this function's callers
  // expect "total", so keep returning it under that key.
  return { average: payload.summary.average, total: payload.summary.count }
}
