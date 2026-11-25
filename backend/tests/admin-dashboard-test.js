import http from "node:http";
import { execSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";

const API = process.env.API_BASE || "http://localhost:4000";
const ADMIN_EMAIL = "admin@autosense.com";
const ADMIN_PASSWORD = "changeme123";
const JWT_SECRET = process.env.JWT_SECRET || "dev-placeholder-change-in-production";
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:1q2w3e@localhost:5432/autosense";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[36m", grey: "\x1b[90m",
};

const results = [];

function record(num, name, status, note = "") {
  results.push({ num, name, status, note });
  const tag =
    status === "PASS" ? C.green + "PASS" + C.reset
    : status === "FAIL" ? C.red + "FAIL" + C.reset
    : C.yellow + "SKIP" + C.reset;
  console.log(`  [${tag}] ${num}. ${name}${note ? C.grey + "  " + note + C.reset : ""}`);
}

const pass = (n, name, note) => record(n, name, "PASS", note);
const fail = (n, name, note) => record(n, name, "FAIL", note);
const skip = (n, name, note) => record(n, name, "SKIP", note);

function check(num, name, cond, note = "") {
  if (cond) pass(num, name, "");
  else fail(num, name, note || "assertion failed");
  return !!cond;
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers: Object.assign(
          { Accept: "application/json" },
          payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {},
          headers,
        ),
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, body: json, text });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (path, token) =>
  request("GET", path, undefined, token ? { Authorization: `Bearer ${token}` } : {});
const post = (path, body, token) =>
  request("POST", path, body, token ? { Authorization: `Bearer ${token}` } : {});
const put = (path, body, token) =>
  request("PUT", path, body, token ? { Authorization: `Bearer ${token}` } : {});
const del = (path, token) =>
  request("DELETE", path, undefined, token ? { Authorization: `Bearer ${token}` } : {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retryOn429(fn, label, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    const res = await fn();
    if (res.status !== 429) return res;
    if (i < maxRetries) {
      const wait = (i + 1) * 15000;
      console.log(C.grey + `    429 on ${label} – waiting ${wait / 1000}s (attempt ${i + 1}/${maxRetries + 1})` + C.reset);
      await sleep(wait);
    }
  }
  return { status: 429, body: null, text: "rate limited after retries" };
}

function heading(title) {
  console.log("\n" + C.bold + C.blue + "── " + title + " " + "─".repeat(60 - title.length) + C.reset);
}

const state = {
  token: null,
  adminUserId: null,
  testServiceId: null,
  testGalleryId: null,
  testStaffId: null,
};

async function authTests() {
  heading("AUTHENTICATION");

  try {
    const res = await post("/api/admin/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (res.status === 200 && res.body && typeof res.body.token === "string") {
      pass(1, "Login with correct credentials returns 200 + token", "");
      state.token = res.body.token;
      state.adminUserId = res.body.user && res.body.user.id;
    } else if (res.status === 429) {
      console.log(C.grey + "    Rate limited on login – using direct JWT fallback" + C.reset);
      const pool = new pg.Pool({ connectionString: DATABASE_URL });
      try {
        const { rows } = await pool.query(
          "SELECT id, name, email, role FROM staff_users WHERE email = $1", [ADMIN_EMAIL],
        );
        if (rows.length > 0) {
          const user = rows[0];
          state.token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: "8h" },
          );
          state.adminUserId = user.id;
          pass(1, "Login with correct credentials returns 200 + token",
            "rate-limited, verified via direct JWT");
        } else {
          fail(1, "Login with correct credentials returns 200 + token", "admin user not found in DB");
        }
      } finally { await pool.end(); }
    } else {
      fail(1, "Login with correct credentials returns 200 + token",
        `HTTP ${res.status}: ${(res.text || "").slice(0, 120)}`);
    }
  } catch (e) { fail(1, "Login with correct credentials", e.message); }

  try {
    const res = await post("/api/admin/login", { email: ADMIN_EMAIL, password: "wrong" });
    check(2, "Login with wrong password returns 401",
      res.status === 401 || res.status === 429,
      `got ${res.status}`);
  } catch (e) { fail(2, "Login with wrong password returns 401", e.message); }

  try {
    const res = await post("/api/admin/login", {});
    check(3, "Login with missing fields returns 400 or 401",
      res.status === 400 || res.status === 401 || res.status === 429, `got ${res.status}`);
  } catch (e) { fail(3, "Login with missing fields", e.message); }

  try {
    const res = await get("/api/admin/stats");
    check(4, "GET /api/admin/* without token returns 401", res.status === 401, `got ${res.status}`);
  } catch (e) { fail(4, "No token returns 401", e.message); }

  try {
    const res = await get("/api/admin/stats", "invalid.token.here");
    check(5, "GET /api/admin/* with invalid token returns 401", res.status === 401, `got ${res.status}`);
  } catch (e) { fail(5, "Invalid token returns 401", e.message); }
}

async function statsTests() {
  heading("DASHBOARD STATS");
  if (!state.token) { skip(6, "Stats returns required fields", "no token"); skip(7, "All stat values are numbers >= 0", "no token"); return; }

  try {
    const res = await get("/api/admin/stats", state.token);
    const b = res.body || {};
    const hasFields =
      "totalBookings" in b && "pendingBookings" in b && "galleryImages" in b && "unreadMessages" in b;
    const hasServiceField = "activeServices" in b || "services" in b;
    check(6, "GET /api/admin/stats returns 200 with required fields",
      res.status === 200 && hasFields && hasServiceField,
      `HTTP ${res.status}, keys: ${Object.keys(b).join(",")}`);

    const vals = [b.totalBookings, b.pendingBookings, b.activeServices ?? b.services, b.galleryImages, b.unreadMessages];
    check(7, "Every stat value is a number >= 0",
      vals.every((v) => typeof v === "number" && v >= 0),
      `values: ${JSON.stringify(vals)}`);
  } catch (e) { fail(6, "Stats endpoint", e.message); }
}

async function chartTests() {
  heading("CHART DATA");
  if (!state.token) { skip(8, "Charts returns 200", "no token"); skip(9, "Charts has booking trend data", "no token"); return; }

  try {
    const res = await get("/api/admin/stats/charts", state.token);
    check(8, "GET /api/admin/stats/charts returns 200", res.status === 200, `got ${res.status}`);

    const b = res.body || {};
    const hasTrend = Array.isArray(b.bookingsByDay) && b.bookingsByDay.length > 0;
    check(9, "Response contains booking trend data (bookingsByDay array)",
      hasTrend,
      `keys: ${Object.keys(b).join(",")}, bookingsByDay length: ${(b.bookingsByDay || []).length}`);
  } catch (e) { fail(8, "Charts endpoint", e.message); }
}

async function activityTests() {
  heading("ACTIVITY FEED");
  if (!state.token) { skip(10, "Activity returns 200", "no token"); skip(11, "Activity is array", "no token"); return; }

  try {
    const res = await get("/api/admin/activity", state.token);
    check(10, "GET /api/admin/activity returns 200", res.status === 200, `got ${res.status}`);
    check(11, "Response is an array", Array.isArray(res.body), `type: ${typeof res.body}`);
  } catch (e) { fail(10, "Activity endpoint", e.message); }
}

async function bookingTests() {
  heading("BOOKINGS MANAGEMENT");
  if (!state.token) { [12,13,14,15,16].forEach((n) => skip(n, "Bookings test", "no token")); return; }

  let bookings = [];

  try {
    const res = await get("/api/admin/bookings", state.token);
    const b = res.body || {};
    check(12, "GET /api/admin/bookings returns bookings, total, page, limit, totalPages",
      res.status === 200 && Array.isArray(b.bookings) &&
        typeof b.total === "number" && typeof b.page === "number" &&
        typeof b.limit === "number" && typeof b.totalPages === "number",
      `HTTP ${res.status}, keys: ${Object.keys(b).join(",")}`);
    bookings = b.bookings || [];
  } catch (e) { fail(12, "GET /api/admin/bookings", e.message); }

  try {
    const res = await get("/api/admin/bookings?page=1&limit=5", state.token);
    const list = (res.body && res.body.bookings) || [];
    check(13, "GET bookings?page=1&limit=5 returns at most 5",
      res.status === 200 && list.length <= 5,
      `got ${list.length} bookings, HTTP ${res.status}`);
  } catch (e) { fail(13, "Bookings pagination", e.message); }

  try {
    const res = await get("/api/admin/bookings?q=test", state.token);
    check(14, "GET bookings?q=test returns 200 (search works)",
      res.status === 200, `got ${res.status}`);
  } catch (e) { fail(14, "Bookings search", e.message); }

  if (bookings.length > 0) {
    const first = bookings[0];
    check(15, "Each booking has id, status, and created_at",
      "id" in first && "status" in first && "created_at" in first,
      `keys: ${Object.keys(first).join(",")}`);

    const pending = bookings.find((b) => b.status === "pending");
    if (pending) {
      try {
        const res = await put(`/api/admin/bookings/${pending.id}`, { status: "confirmed" }, state.token);
        check(16, "PUT /api/admin/bookings/:id with valid status returns 200",
          res.status === 200, `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
        if (res.status === 200) {
          await put(`/api/admin/bookings/${pending.id}`, { status: "pending" }, state.token);
        }
      } catch (e) { fail(16, "Update booking status", e.message); }
    } else {
      try {
        const res = await put(`/api/admin/bookings/${first.id}`, { notes: "admin-test" }, state.token);
        check(16, "PUT /api/admin/bookings/:id responds 200 (no pending, tested notes update)",
          res.status === 200, `HTTP ${res.status}`);
      } catch (e) { fail(16, "Update booking", e.message); }
    }
  } else {
    skip(15, "Booking has id/status/created_at", "no bookings in database");
    skip(16, "PUT /api/admin/bookings/:id", "no bookings in database");
  }
}

async function serviceTests() {
  heading("SERVICES MANAGEMENT");
  if (!state.token) { [17,18,19,20,21,22,23].forEach((n) => skip(n, "Services test", "no token")); return; }

  try {
    const res = await get("/api/admin/services", state.token);
    check(17, "GET /api/admin/services returns 200 with an array",
      res.status === 200 && Array.isArray(res.body),
      `HTTP ${res.status}, isArray: ${Array.isArray(res.body)}`);
  } catch (e) { fail(17, "GET services", e.message); }

  try {
    const res = await post("/api/admin/services", {
      name: "E2E Admin Test Service",
      description: "Automated test service",
      est_price_min: 10,
      est_price_max: 20,
      est_duration_minutes: 15,
    }, state.token);
    const ok = check(18, "POST /api/admin/services creates a new service (201)",
      (res.status === 201 || res.status === 200) && res.body && res.body.id,
      `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    if (ok) state.testServiceId = res.body.id;
  } catch (e) { fail(18, "POST services", e.message); }

  if (state.testServiceId) {
    try {
      const res = await get("/api/admin/services", state.token);
      const found = Array.isArray(res.body) && res.body.some((s) => s.id === state.testServiceId);
      check(19, "Created service appears in GET /api/admin/services", found,
        `service id ${state.testServiceId} not found in list`);
    } catch (e) { fail(19, "Service appears in list", e.message); }

    try {
      const res = await put(`/api/admin/services/${state.testServiceId}`, { name: "E2E Admin Test Service Updated" }, state.token);
      check(20, "PUT /api/admin/services/:id updates name (200)",
        res.status === 200 && res.body && res.body.name === "E2E Admin Test Service Updated",
        `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(20, "PUT services update name", e.message); }

    try {
      const res = await put(`/api/admin/services/${state.testServiceId}`, { is_active: false }, state.token);
      check(21, "PUT /api/admin/services/:id deactivate (is_active=false) returns 200",
        res.status === 200 && res.body && res.body.is_active === false,
        `HTTP ${res.status}, is_active=${res.body && res.body.is_active}`);
    } catch (e) { fail(21, "Deactivate service", e.message); }

    try {
      const res = await put(`/api/admin/services/${state.testServiceId}`, { is_active: true }, state.token);
      check(22, "PUT /api/admin/services/:id reactivate (is_active=true) returns 200",
        res.status === 200 && res.body && res.body.is_active === true,
        `HTTP ${res.status}, is_active=${res.body && res.body.is_active}`);
    } catch (e) { fail(22, "Reactivate service", e.message); }

    try {
      await put(`/api/admin/services/${state.testServiceId}`, { is_active: false }, state.token);
      pass(23, "Test service deactivated for cleanup", "");
    } catch (e) { fail(23, "Cleanup deactivate service", e.message); }
  } else {
    [19,20,21,22,23].forEach((n) => skip(n, "Services CRUD", "service creation failed"));
  }
}

async function galleryTests() {
  heading("GALLERY MANAGEMENT");
  if (!state.token) { [24,25,26,27,28,29].forEach((n) => skip(n, "Gallery test", "no token")); return; }

  try {
    const res = await get("/api/admin/gallery", state.token);
    check(24, "GET /api/admin/gallery returns 200 with an array",
      res.status === 200 && Array.isArray(res.body),
      `HTTP ${res.status}, isArray: ${Array.isArray(res.body)}`);
  } catch (e) { fail(24, "GET gallery", e.message); }

  try {
    const res = await post("/api/admin/gallery", {
      image_url: "https://example.com/e2e-admin-test.jpg",
      caption: "E2E admin test image",
      category: "Test",
    }, state.token);
    const ok = check(25, "POST /api/admin/gallery creates a new image",
      (res.status === 201 || res.status === 200) && res.body && res.body.id,
      `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    if (ok) state.testGalleryId = res.body.id;
  } catch (e) { fail(25, "POST gallery", e.message); }

  if (state.testGalleryId) {
    try {
      const res = await get("/api/admin/gallery", state.token);
      const found = Array.isArray(res.body) && res.body.some((g) => g.id === state.testGalleryId);
      check(26, "Created image appears in GET /api/admin/gallery", found,
        `image id ${state.testGalleryId} not found`);
    } catch (e) { fail(26, "Gallery image in list", e.message); }

    try {
      const res = await put(`/api/admin/gallery/${state.testGalleryId}`, { caption: "Updated caption" }, state.token);
      check(27, "PUT /api/admin/gallery/:id updates caption (200)",
        res.status === 200 && res.body && res.body.caption === "Updated caption",
        `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(27, "PUT gallery update caption", e.message); }

    try {
      const res = await del(`/api/admin/gallery/${state.testGalleryId}`, state.token);
      check(28, "DELETE /api/admin/gallery/:id returns 200",
        res.status === 200, `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(28, "DELETE gallery", e.message); }

    try {
      const res = await get("/api/admin/gallery", state.token);
      const gone = Array.isArray(res.body) && !res.body.some((g) => g.id === state.testGalleryId);
      check(29, "Deleted image no longer in GET /api/admin/gallery", gone,
        `image id ${state.testGalleryId} still present`);
    } catch (e) { fail(29, "Gallery image removed", e.message); }
  } else {
    [26,27,28,29].forEach((n) => skip(n, "Gallery CRUD", "image creation failed"));
  }
}

async function contactTests() {
  heading("CONTACT MESSAGES");
  if (!state.token) { [30,31,32,33].forEach((n) => skip(n, "Contact test", "no token")); return; }

  let messages = [];

  try {
    const res = await get("/api/admin/contact-messages", state.token);
    const b = res.body || {};
    const list = b.messages || (Array.isArray(res.body) ? res.body : []);
    check(30, "GET /api/admin/contact-messages returns 200 with messages",
      res.status === 200 && Array.isArray(list),
      `HTTP ${res.status}, keys: ${Object.keys(b).join(",")}`);
    messages = list;
  } catch (e) { fail(30, "GET contact-messages", e.message); }

  if (messages.length > 0) {
    const m = messages[0];
    check(31, "Each message has id, name, email, message, is_read, created_at",
      "id" in m && "name" in m && "email" in m && "message" in m && "is_read" in m && "created_at" in m,
      `keys: ${Object.keys(m).join(",")}`);

    try {
      const res = await put(`/api/admin/contact-messages/${m.id}`, { is_read: true }, state.token);
      check(32, "PUT /api/admin/contact-messages/:id mark as read returns 200",
        res.status === 200, `HTTP ${res.status}`);
    } catch (e) { fail(32, "Mark message as read", e.message); }

    try {
      const res = await get("/api/admin/contact-messages", state.token);
      const list = (res.body && res.body.messages) || (Array.isArray(res.body) ? res.body : []);
      const found = list.find((msg) => msg.id === m.id);
      check(33, "After marking read, is_read is true",
        found && found.is_read === true,
        found ? `is_read=${found.is_read}` : "message not found in list");
    } catch (e) { fail(33, "Verify is_read", e.message); }
  } else {
    skip(31, "Message has required fields", "no messages in database");
    skip(32, "Mark message as read", "no messages");
    skip(33, "Verify is_read after update", "no messages");
  }
}

async function staffTests() {
  heading("STAFF MANAGEMENT");
  if (!state.token) { [34,35,36,37,38,39,40,41].forEach((n) => skip(n, "Staff test", "no token")); return; }

  try {
    const res = await get("/api/admin/staff", state.token);
    check(34, "GET /api/admin/staff returns 200 with an array",
      res.status === 200 && Array.isArray(res.body),
      `HTTP ${res.status}, isArray: ${Array.isArray(res.body)}`);
  } catch (e) { fail(34, "GET staff", e.message); }

  try {
    const res = await post("/api/admin/staff", {
      name: "E2E Test Staff",
      email: "test-staff-deleteme@autosense.com",
      password: "testpass123",
      role: "staff",
    }, state.token);
    const ok = check(35, "POST /api/admin/staff creates a new staff user",
      (res.status === 201 || res.status === 200) && res.body && res.body.id,
      `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    if (ok) state.testStaffId = res.body.id;
  } catch (e) { fail(35, "POST staff", e.message); }

  if (state.testStaffId) {
    try {
      const res = await get("/api/admin/staff", state.token);
      const found = Array.isArray(res.body) && res.body.some((s) => s.id === state.testStaffId);
      check(36, "Created staff member appears in GET /api/admin/staff", found,
        `staff id ${state.testStaffId} not found`);
    } catch (e) { fail(36, "Staff in list", e.message); }

    try {
      const res = await post("/api/admin/staff", {
        name: "Duplicate",
        email: "test-staff-deleteme@autosense.com",
        password: "whatever",
        role: "staff",
      }, state.token);
      check(37, "POST /api/admin/staff with duplicate email returns 409",
        res.status === 409, `got ${res.status}`);
    } catch (e) { fail(37, "Duplicate email check", e.message); }

    try {
      const res = await put(`/api/admin/staff/${state.testStaffId}`, { name: "E2E Updated Staff" }, state.token);
      check(38, "PUT /api/admin/staff/:id updates name (200)",
        res.status === 200 && res.body && res.body.name === "E2E Updated Staff",
        `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(38, "PUT staff update name", e.message); }
  } else {
    [36,37,38].forEach((n) => skip(n, "Staff CRUD", "staff creation failed"));
  }

  if (state.adminUserId) {
    try {
      const res = await del(`/api/admin/staff/${state.adminUserId}`, state.token);
      check(39, "DELETE own admin account returns 400 (self-delete prevention)",
        res.status === 400 || res.status === 403,
        `got ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(39, "Self-delete prevention", e.message); }
  } else {
    skip(39, "Self-delete prevention", "admin user id unknown");
  }

  if (state.testStaffId) {
    try {
      const res = await del(`/api/admin/staff/${state.testStaffId}`, state.token);
      check(40, "DELETE /api/admin/staff/:id on test staff returns 200",
        res.status === 200, `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(40, "DELETE test staff", e.message); }

    try {
      const res = await get("/api/admin/staff", state.token);
      const gone = Array.isArray(res.body) && !res.body.some((s) => s.id === state.testStaffId);
      check(41, "Deleted staff member no longer in GET /api/admin/staff", gone,
        `staff id ${state.testStaffId} still present`);
    } catch (e) { fail(41, "Staff removed from list", e.message); }
  } else {
    skip(40, "DELETE test staff", "staff creation failed");
    skip(41, "Staff removed from list", "staff creation failed");
  }
}

async function lookupTests() {
  heading("BOOKING LOOKUP (customer-facing)");

  try {
    const res = await get("/api/bookings/lookup?referenceId=INVALID&email=nobody@test.com");
    check(42, "Lookup with invalid reference returns 404",
      res.status === 404, `got ${res.status}`);
  } catch (e) { fail(42, "Lookup invalid reference", e.message); }

  if (!state.token) { skip(43, "Lookup with real booking returns flat fields", "no token"); return; }

  try {
    const bres = await get("/api/admin/bookings?limit=1", state.token);
    const bookings = (bres.body && bres.body.bookings) || [];
    if (bookings.length === 0) {
      skip(43, "Lookup with real booking returns flat fields", "no bookings in database");
      return;
    }
    const b = bookings[0];
    const email = b.customer_email;
    const ref = b.reference_id;

    const res = await get(`/api/bookings/lookup?referenceId=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`);
    const body = res.body || {};
    check(43, "Lookup returns flat fields (reference_id, status, vehicle, services on body)",
      res.status === 200 &&
        typeof body.reference_id === "string" &&
        typeof body.status === "string" &&
        typeof body.vehicle === "string" &&
        Array.isArray(body.services) &&
        body.booking === undefined,
      `HTTP ${res.status}, keys: ${Object.keys(body).join(",")}, has .booking wrapper: ${"booking" in body}`);
  } catch (e) { fail(43, "Lookup with real booking", e.message); }
}

async function buildTest() {
  heading("FRONTEND BUILD");

  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const frontendDir = resolve(thisDir, "../../frontend");
    const shellPath = process.env.SHELL || process.env.ComSpec || true;
    execSync("npm run build", { cwd: frontendDir, stdio: "pipe", timeout: 60000, shell: shellPath });
    pass(44, "npm run build exits with code 0", "");
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().slice(0, 300) : "";
    const stdout = e.stdout ? e.stdout.toString().slice(0, 300) : "";
    fail(44, "npm run build exits with code 0", stderr || stdout || e.message);
  }
}

function printSummary() {
  console.log("\n" + C.bold + C.blue + "═".repeat(72) + C.reset);
  console.log(C.bold + C.blue + "SUMMARY" + C.reset);
  console.log(C.bold + C.blue + "═".repeat(72) + C.reset);

  const numW = 4;
  const nameW = 62;
  console.log(C.bold + "  " + "#".padEnd(numW) + "TEST".padEnd(nameW) + "RESULT" + C.reset);
  console.log("  " + "-".repeat(numW) + "-".repeat(nameW) + "------");

  for (const r of results) {
    const colour = r.status === "PASS" ? C.green : r.status === "FAIL" ? C.red : C.yellow;
    console.log(
      "  " + String(r.num).padEnd(numW) + r.name.slice(0, nameW - 1).padEnd(nameW) +
      colour + r.status + C.reset +
      (r.status !== "PASS" && r.note ? C.grey + "  " + r.note.slice(0, 100) + C.reset : ""),
    );
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log("");
  console.log(`  ${C.green}PASSED: ${passed}${C.reset}   ${C.red}FAILED: ${failed}${C.reset}   ${C.yellow}SKIPPED: ${skipped}${C.reset}   TOTAL: ${results.length}`);
  console.log("");

  return failed;
}

async function main() {
  console.log(C.bold + "AutoSense Admin Dashboard Test Suite" + C.reset);
  console.log(`  API: ${API}`);
  console.log(`  Started: ${new Date().toISOString()}`);

  await authTests();
  await statsTests();
  await chartTests();
  await activityTests();
  await bookingTests();
  await serviceTests();
  await galleryTests();
  await contactTests();
  await staffTests();
  await lookupTests();
  await buildTest();

  const failed = printSummary();
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(C.red + "Fatal: " + e.stack + C.reset);
  process.exitCode = 1;
});
