import mockReviews from '../mocks/reviews.js'
import { toCamel, delay } from './client.js'

export async function getReviews() {
  await delay()
  return toCamel(mockReviews)
}

export async function getFeaturedReviews() {
  await delay()
  return toCamel(mockReviews.filter((review) => review.is_featured))
}

export async function getRatingSummary() {
  await delay()
  const total = mockReviews.length
  const sum = mockReviews.reduce((acc, review) => acc + review.rating, 0)
  const average = total === 0 ? 0 : Math.round((sum / total) * 10) / 10
  return { average, total }
}
