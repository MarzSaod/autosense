import nodemailer from "nodemailer";
import { query } from "../db/pool.js";

const SMTP_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const SEND_TIMEOUT_MS = 10_000;

function isResendConfigured() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  return (
    typeof key === "string" &&
    key.trim().length > 0 &&
    typeof from === "string" &&
    from.trim().length > 0
  );
}

function isSmtpConfigured() {
  return SMTP_VARS.every((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function isEmailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

let cachedTransport = null;

function smtpTransport() {
  if (cachedTransport) return cachedTransport;
  const port = Number(process.env.SMTP_PORT);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransport;
}

function smtpFromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

async function loadShopInfo() {
  try {
    const { rows } = await query(
      "SELECT shop_name, address, phone, email FROM shop_settings LIMIT 1",
    );
    return rows[0] || null;
  } catch {
    return null;
  }
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

async function sendViaResend({ to, subject, html, text, replyTo }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const fromName = process.env.EMAIL_FROM_NAME || "AutoSense";
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;

    const body = {
      from: `${fromName} <${fromAddress}>`,
      to: [to],
      subject,
      html,
      text,
    };
    if (replyTo) body.reply_to = replyTo;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Email send failed: ${response.status}`);
      return false;
    }

    const result = await response.json();
    return !!result.id;
  } catch (error) {
    console.error(`Email send failed: ${error.name}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaSmtp({ to, subject, html, text }) {
  try {
    const result = await Promise.race([
      smtpTransport().sendMail({
        from: smtpFromAddress(),
        to,
        subject,
        html,
        text,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), SEND_TIMEOUT_MS),
      ),
    ]);
    return !!result;
  } catch (error) {
    console.error(`Email send failed: ${error.code || error.name}`);
    return false;
  }
}

async function send({ to, subject, html, text, replyTo, label }) {
  if (isResendConfigured()) {
    return sendViaResend({ to, subject, html, text, replyTo });
  }
  if (isSmtpConfigured()) {
    return sendViaSmtp({ to, subject, html, text });
  }
  console.log(`Email not configured, skipping (${label})`);
  return false;
}

function shopInfoHtml(shop) {
  if (!shop) return "";
  const parts = [shop.shop_name, shop.address, shop.phone].filter(Boolean);
  if (parts.length === 0) return "";
  return `<p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">${parts.map((p) => escapeHtml(p)).join("<br />")}</p>`;
}

function shopInfoText(shop) {
  if (!shop) return "";
  const parts = [shop.shop_name, shop.address, shop.phone].filter(Boolean);
  if (parts.length === 0) return "";
  return "\n---\n" + parts.join("\n");
}

export async function sendBookingConfirmation(booking) {
  const shop = await loadShopInfo();
  const shopName = shop?.shop_name || "AutoSense";
  const date = formatLongDate(booking.date);
  const time = formatTimeLabel(booking.time);
  const vehicle = [
    booking.vehicle?.year,
    booking.vehicle?.make,
    booking.vehicle?.model,
  ]
    .filter(Boolean)
    .join(" ");
  const serviceListHtml = (booking.services || [])
    .map((s) => `<li>${escapeHtml(s.name)}</li>`)
    .join("");
  const serviceListText = (booking.services || [])
    .map((s) => `  - ${s.name}`)
    .join("\n");

  const html = `<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; max-width: 560px;">
<h2 style="color: #0f2a43;">Your appointment is booked</h2>
<p>Thanks, ${escapeHtml(booking.fullName)}. Here are your details.</p>
<p style="font-size: 18px; margin: 20px 0;">Reference: <strong style="color: #0f766e;">${escapeHtml(booking.referenceId)}</strong></p>
<table cellpadding="0" cellspacing="0" style="font-size: 15px;">
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;"><strong>${escapeHtml(date)}</strong></td></tr>
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Time</td><td style="padding: 4px 0;"><strong>${escapeHtml(time)}</strong></td></tr>
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Vehicle</td><td style="padding: 4px 0;"><strong>${escapeHtml(vehicle)}</strong></td></tr>
</table>
${serviceListHtml ? `<p style="margin-bottom: 4px; color: #6b7280;">Services</p><ul style="margin-top: 0;">${serviceListHtml}</ul>` : ""}
<p style="color: #6b7280; font-size: 14px;">The shop will confirm your appointment shortly.</p>
${shopInfoHtml(shop)}
</div>`;

  const text = [
    "Your appointment is booked",
    "",
    `Thanks, ${booking.fullName}. Here are your details.`,
    "",
    `Reference: ${booking.referenceId}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Vehicle: ${vehicle}`,
    serviceListText ? `Services:\n${serviceListText}` : null,
    "",
    "The shop will confirm your appointment shortly.",
    shopInfoText(shop),
  ]
    .filter((line) => line !== null)
    .join("\n");

  return send({
    to: booking.email,
    subject: `Your ${shopName} appointment - ${booking.referenceId}`,
    html,
    text,
    replyTo: shop?.email || undefined,
    label: "booking confirmation",
  });
}

async function loadBookingServices(bookingId) {
  try {
    const { rows } = await query(
      `SELECT s.name
         FROM booking_services bs
         JOIN services s ON s.id = bs.service_id
        WHERE bs.booking_id = $1
        ORDER BY s.id`,
      [bookingId],
    );
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

export async function sendBookingStatusEmail(booking) {
  const shop = await loadShopInfo();
  const shopName = shop?.shop_name || "AutoSense";
  const ref = booking.reference_id;
  const date = formatLongDate(booking.appointment_date);
  const time = formatTimeLabel(booking.appointment_time);
  const vehicle = [
    booking.vehicle_year,
    booking.vehicle_make,
    booking.vehicle_model,
  ]
    .filter(Boolean)
    .join(" ");
  const serviceNames = booking.id ? await loadBookingServices(booking.id) : [];
  const serviceListHtml = serviceNames
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");
  const serviceListText = serviceNames.map((n) => `  - ${n}`).join("\n");

  let subject;
  let heading;
  let message;

  if (booking.status === "confirmed") {
    subject = `Your ${shopName} appointment is confirmed`;
    heading = "Your appointment is confirmed";
    message = "Please arrive about 10 minutes before your scheduled time.";
  } else if (booking.status === "cancelled") {
    subject = `Your ${shopName} appointment has been cancelled`;
    heading = "Your appointment has been cancelled";
    message =
      "If you would like to rebook, please visit our website or call us.";
  } else if (booking.status === "completed") {
    subject = `Thanks for visiting ${shopName}`;
    heading = "Thanks for visiting";
    message = "We hope to see you again.";
  } else {
    return false;
  }

  const html = `<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; max-width: 560px;">
<h2 style="color: #0f2a43;">${heading}</h2>
<p>${message}</p>
<table cellpadding="0" cellspacing="0" style="font-size: 15px;">
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Reference</td><td style="padding: 4px 0;"><strong>${escapeHtml(ref)}</strong></td></tr>
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;"><strong>${escapeHtml(date)}</strong></td></tr>
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Time</td><td style="padding: 4px 0;"><strong>${escapeHtml(time)}</strong></td></tr>
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Vehicle</td><td style="padding: 4px 0;"><strong>${escapeHtml(vehicle)}</strong></td></tr>
</table>
${serviceListHtml ? `<p style="margin-bottom: 4px; color: #6b7280;">Services</p><ul style="margin-top: 0;">${serviceListHtml}</ul>` : ""}
${shopInfoHtml(shop)}
</div>`;

  const textBody = [
    heading,
    "",
    message,
    "",
    `Reference: ${ref}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Vehicle: ${vehicle}`,
    serviceListText ? `Services:\n${serviceListText}` : null,
    shopInfoText(shop),
  ]
    .filter((line) => line !== null)
    .join("\n");

  return send({
    to: booking.customer_email,
    subject,
    html,
    text: textBody,
    replyTo: shop?.email || undefined,
    label: `status update (${booking.status})`,
  });
}

export async function sendContactNotification(message, shopEmail) {
  const to = process.env.SHOP_EMAIL || shopEmail;
  if (!to) return false;

  const html = `<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; max-width: 560px;">
<h2 style="color: #0f2a43;">New message from the contact form</h2>
<table cellpadding="0" cellspacing="0" style="font-size: 15px; margin: 16px 0;">
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Name</td><td style="padding: 4px 0;"><strong>${escapeHtml(message.name)}</strong></td></tr>
<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Email</td><td style="padding: 4px 0;"><strong>${escapeHtml(message.email)}</strong></td></tr>
${message.phone ? `<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Phone</td><td style="padding: 4px 0;"><strong>${escapeHtml(message.phone)}</strong></td></tr>` : ""}
</table>
<p style="white-space: pre-wrap;">${escapeHtml(message.message)}</p>
</div>`;

  const text = [
    "New message from the contact form",
    "",
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    message.phone ? `Phone: ${message.phone}` : null,
    "",
    message.message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return send({
    to,
    subject: `Contact form: ${message.name}`,
    html,
    text,
    replyTo: message.email,
    label: "contact notification",
  });
}

export default {
  isEmailConfigured,
  sendBookingConfirmation,
  sendBookingStatusEmail,
  sendContactNotification,
};
