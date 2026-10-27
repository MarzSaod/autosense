import { getJson, toCamel } from './client.js'

export async function getShopSettings() {
  return toCamel(await getJson('/api/shop-settings'))
}
