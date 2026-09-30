import mockServices from '../mocks/services.js'
import { toCamel, delay } from './client.js'

export async function getServices() {
  await delay()
  return toCamel(mockServices.filter((service) => service.is_active))
}

export async function getServiceById(id) {
  await delay()
  const match = mockServices.find((service) => service.id === id)
  return match ? toCamel(match) : null
}
