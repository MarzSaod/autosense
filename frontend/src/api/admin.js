import { API_BASE_URL, toCamel } from './client.js'

const TOKEN_KEY = 'autosense_admin_token'

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function authHeaders() {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function request(method, path, body) {
  const options = { method, headers: authHeaders() }
  if (body !== undefined) options.body = JSON.stringify(body)
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
    }
    throw new Error(
      response.status === 429
        ? 'Too many attempts. Please try again later.'
        : payload?.error || 'Something went wrong.',
    )
  }
  return payload
}

export async function adminLogin(email, password) {
  const data = await request('POST', '/api/admin/login', { email, password })
  localStorage.setItem(TOKEN_KEY, data.token)
  return toCamel(data.user)
}

export async function adminLogout() {
  try {
    await request('POST', '/api/admin/logout')
  } catch {
    // ignore
  }
  localStorage.removeItem(TOKEN_KEY)
}

export async function getAdminUser() {
  const data = await request('GET', '/api/admin/me')
  return toCamel(data)
}

export async function getAdminStats() {
  const data = await request('GET', '/api/admin/stats')
  return toCamel(data)
}

export async function getAdminServices() {
  const data = await request('GET', '/api/admin/services')
  return toCamel(data)
}

export async function createService(data) {
  const result = await request('POST', '/api/admin/services', data)
  return toCamel(result)
}

export async function updateService(id, data) {
  const result = await request('PUT', `/api/admin/services/${id}`, data)
  return toCamel(result)
}

export async function deleteService(id) {
  const result = await request('DELETE', `/api/admin/services/${id}`)
  return toCamel(result)
}

export async function getAdminBookings(params = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.dateFrom) query.set('date_from', params.dateFrom)
  if (params.dateTo) query.set('date_to', params.dateTo)
  const qs = query.toString()
  const data = await request('GET', `/api/admin/bookings${qs ? `?${qs}` : ''}`)
  return toCamel(data)
}

export async function updateBooking(id, data) {
  const result = await request('PUT', `/api/admin/bookings/${id}`, data)
  return toCamel(result)
}

export async function getAdminGallery() {
  const data = await request('GET', '/api/admin/gallery')
  return toCamel(data)
}

export async function createGalleryImage(data) {
  const result = await request('POST', '/api/admin/gallery', data)
  return toCamel(result)
}

export async function updateGalleryImage(id, data) {
  const result = await request('PUT', `/api/admin/gallery/${id}`, data)
  return toCamel(result)
}

export async function deleteGalleryImage(id) {
  const result = await request('DELETE', `/api/admin/gallery/${id}`)
  return toCamel(result)
}
