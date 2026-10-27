import { getJson, toCamel } from './client.js'

export async function getServices() {
  return toCamel(await getJson('/api/services'))
}

export async function getServiceById(id) {
  const services = await getServices()
  const match = services.find((service) => service.id === id)
  return match || null
}
