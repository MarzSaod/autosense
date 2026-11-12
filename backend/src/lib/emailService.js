import nodemailer from "nodemailer";

/**
 * Outbound email, and entirely optional.
 *
 * SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS are all required for mail to
 * go out. With any of them missing - which is the case on a fresh deploy, and
 * in local development - every send logs once and returns. Nothing here ever
 * throws at the caller: a booking that saved is a booking that happened, and a
 * mail server having a bad day is not a reason to tell the customer their
 * appointment failed.
 */

const SMTP_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];

/** True when every SMTP variable is set, so callers can report emailSent. */
export function isEmailConfigured() {
  return SMTP_VARS.every((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}

let cachedTransport = null;

function transport() {
  if (cachedTransport) return cachedTransport;

  const port = Number(process.env.SMTP_PORT);

  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via STARTTLS.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  return cachedTransport;
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLongDate(dateKey) {
  // dateKey is "YYYY-MM-DD" in the shop's wall-clock frame. Parsed as UTC noon
  // so no timezone can roll it onto the neighbouring day.
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;

  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(time24) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time24 || ""));
  if (!match) return time24;

  const hour = Number(match[1]);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${match[2]} ${period}`;
}

/**
 * Send one message, swallowing any failure.
 *
 * Returns true when the message was handed to the SMTP server, false when mail
 * is not configured or the send failed.
 */
async function send({ to, subject, html, label }) {
  if (!isEmailConfigured()) {
    console.log(`Email not configured, skipping (${label})`);
    return false;
  }

  try {
    await transport().sendMail({ from: fromAddress(), to, subject, html });
    console.log(`Sent ${label} to ${to}`);
    return true;
  } catch (error) {
    console.error(`Failed to send ${label} to ${to}:`, error.message);
    return false;
  }
}

/**
 * The customer's booking confirmation.
 *
 * `booking` is the shape the POST /api/bookings response is built from:
 *   { referenceId, email, fullName, date, time, durationMinutes,
 *     vehicle: { year, make, model }, services: [{ name }] }
 */
export async function sendBookingConfirmation(booking) {
  const serviceList = (booking.services || [])
    .map((service) => `<li>${escapeHtml(service.name)}</li>`)
    .join("");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="color: #0f2a43; margin-bottom: 4px;">Your appointment is booked</h2>
      <p style="margin-top: 0;">Thanks, ${escapeHtml(booking.fullName)}. Here are the details.</p>

      <p style="font-size: 18px; margin: 20px 0;">
        Reference number:
        <strong style="color: #0f766e;">${escapeHtml(booking.referenceId)}</strong><br />
        <span style="font-size: 14px; color: #6b7280;">
          Save this number - you can look up or cancel your booking with it.
        </span>
      </p>

      <table cellpadding="0" cellspacing="0" style="font-size: 15px;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Date</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(formatLongDate(booking.date))}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Time</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(formatTimeLabel(booking.time))}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Vehicle</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(
            [booking.vehicle?.year, booking.vehicle?.make, booking.vehicle?.model]
              .filter(Boolean)
              .join(" ")
          )}</strong></td>
        </tr>
      </table>

      ${
        serviceList
          ? `<p style="margin-bottom: 4px; color: #6b7280;">Services</p>
             <ul style="margin-top: 0;">${serviceList}</ul>`
          : ""
      }

      <p style="color: #6b7280; font-size: 14px;">
        The shop will confirm your appointment shortly. If you need to cancel, use your
        reference number on the Check My Booking page.
      </p>
    </div>
  `;

  return send({
    to: booking.email,
    subject: `Your AutoSense appointment - ${booking.referenceId}`,
    html,
    label: "booking confirmation",
  });
}

/**
 * Tell the shop a customer used the contact form.
 *
 * Goes to SHOP_EMAIL, or to the address from shop_settings when the caller
 * passes one. Returns false (and sends nothing) when neither is available.
 */
export async function sendContactNotification(message, shopEmail) {
  const to = process.env.SHOP_EMAIL || shopEmail;

  if (!to) {
    console.log("No shop email address available, skipping (contact notification)");
    return false;
  }

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="color: #0f2a43; margin-bottom: 4px;">New message from the contact form</h2>

      <table cellpadding="0" cellspacing="0" style="font-size: 15px; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Name</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(message.name)}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #6b7280;">Email</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(message.email)}</strong></td>
        </tr>
        ${
          message.phone
            ? `<tr>
                 <td style="padding: 4px 16px 4px 0; color: #6b7280;">Phone</td>
                 <td style="padding: 4px 0;"><strong>${escapeHtml(message.phone)}</strong></td>
               </tr>`
            : ""
        }
      </table>

      <p style="color: #6b7280; margin-bottom: 4px;">Message</p>
      <p style="white-space: pre-wrap; margin-top: 0;">${escapeHtml(message.message)}</p>
    </div>
  `;

  return send({
    to,
    subject: `AutoSense contact form: ${message.name}`,
    html,
    label: "contact notification",
  });
}

export default { isEmailConfigured, sendBookingConfirmation, sendContactNotification };
