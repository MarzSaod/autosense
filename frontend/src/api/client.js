export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const USE_MOCKS = false

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
