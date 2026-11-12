import { postJson, toCamel } from './client.js'

/**
 * Send a message from the Contact page.
 *
 * Takes { name, email, phone?, message } and resolves to
 * { success, message, id, createdAt }. Rejects with an ApiError carrying the
 * backend's `field` and `fieldMessage`, so a server-side validation failure can
 * be shown against the field it belongs to.
 */
export async function sendContactMessage({ name, email, phone, message }) {
  return toCamel(
    await postJson('/api/contact', {
      name,
      email,
      phone: phone || undefined,
      message,
    }),
  )
}
