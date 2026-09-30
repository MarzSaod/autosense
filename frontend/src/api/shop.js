import mockShopSettings from '../mocks/shopSettings.js'
import { toCamel, delay } from './client.js'

export async function getShopSettings() {
  await delay()
  return toCamel(mockShopSettings)
}
