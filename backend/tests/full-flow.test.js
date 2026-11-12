#!/usr/bin/env node
/**
 * AutoSense end-to-end API test suite.
 *
 * A plain Node script - no test framework, no dependencies beyond the built-in
 * modules.  It drives the real HTTP API end to end, prints a per-test summary
 * table, and finishes with the SQL needed to undo what it wrote.
 *
 * THIS SUITE WRITES TO WHATEVER DATABASE IT POINTS AT.  It creates real
 * bookings (which hold real appointment slots), real diagnosis requests and
 * real contact messages.  Nothing is rolled back: the cleanup SQL it prints at
 * the end is not optional, and must be run against the target database once
 * the run finishes.
 *
 * TEST GROUPS
 *    1  health and data endpoints - /api/health, services, reviews, gallery, shop settings
 *    2  AI diagnosis quality - eight descriptions, each expecting a known service or a rejection
 *    3  availability - month grid, past dates, day slot grid
 *    4  single service booking - creates a booking, checks the reference format and echo
 *    5  multi-service booking - two services on one appointment, longer duration
 *    6  concurrency - fills a slot to max_concurrent_appointments and expects 409 after
 *    7  validation - empty services, past date, missing name, empty description
 *    8  booking lookup - the real pair, wrong email, unknown reference, missing parameters
 *    9  cancellation - cancel, repeat cancel, wrong email, lookup after, slot freed
 *   10  contact form - a complete message plus each required field missing in turn
 *   11  diagnosis to booking link - books with diagnosisRequestId (DB check noted as manual)
 *   12  404 page - browser only, reported as a manual check
 *   13  email confirmation flag - email_sent present on the booking response
 *
 * RUNNING IT AGAINST A LOCAL SERVER (the default)
 *    cd backend && npm start                 # listens on port 4000
 *    node backend/tests/full-flow.test.js
 *
 * RUNNING IT AGAINST PRODUCTION
 *    API_BASE=https://autosense-production.up.railway.app CONFIRM_PROD=yes \
 *      node backend/tests/full-flow.test.js
 *
 * Any API_BASE that is not localhost is treated as live: the suite prints a
 * warning, and refuses to send a single request unless CONFIRM_PROD=yes is set.
 * A production run takes about two minutes (the diagnosis endpoint is rate
 * limited to 8/min, so those calls are paced 8s apart).
 *
 * NOTE on the live contract (it differs from the original spec):
 *   POST /api/bookings expects
 *     { serviceIds:[int], vehicle:{make,model,year}, contact:{fullName,email,phone},
 *       date:"YYYY-MM-DD", time:"HH:MM", diagnosisRequestId? }
 *     and answers 201 { reference_id: "AS-XXXXXX", ... }
 *   GET /api/availability/month expects ?year=YYYY&month=M (1-12) and answers
 *     { shop_today, days:[{date,is_open,is_available,open_slot_count}] }
 *   GET /api/availability/day answers a bare array [{date,time,is_available}]
 *   POST /api/diagnosis reads only { description } (>= 10 chars) and answers
 *     { suggestedServiceId, matchedCode, estCostMin/Max, estTimeMinHours/MaxHours,
 *       outOfContext? }
 *   A full-capacity slot answers 409 with reason "at_capacity", not "SLOT_TAKEN".
 */

// ESM, because backend/package.json sets "type": "module".
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

// Local by default: a bare `node full-flow.test.js` must never write test
// bookings into the live database.  backend/src/server.js listens on
// process.env.PORT || 4000, so 4000 is the local target.
const DEFAULT_API = "http://localhost:4000";
const API = process.env.API_BASE || DEFAULT_API;
const FRONTEND = "https://autosense-phi.vercel.app";
const SHOP_TZ = "America/New_York";

/* ------------------------------------------------------------------ */
/* logging                                                             */
/* ------------------------------------------------------------------ */

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[36m", grey: "\x1b[90m",
};

function group(title) {
  console.log("\n" + C.bold + C.blue + "=".repeat(72) + C.reset);
  console.log(C.bold + C.blue + title + C.reset);
  console.log(C.bold + C.blue + "=".repeat(72) + C.reset);
}
function info(msg) { console.log(C.grey + "    " + msg + C.reset); }

/* ------------------------------------------------------------------ */
/* result registry                                                     */
/* ------------------------------------------------------------------ */

const results = [];

function record(name, status, note = "") {
  results.push({ name, status, note });
  const tag =
    status === "PASS" ? C.green + "PASS" + C.reset
    : status === "FAIL" ? C.red + "FAIL" + C.reset
    : C.yellow + "SKIP" + C.reset;
  console.log(`  [${tag}] ${name}${note ? C.dim + "  - " + note + C.reset : ""}`);
}
const pass = (n, note) => record(n, "PASS", note);
const fail = (n, note) => record(n, "FAIL", note);
const skip = (n, note) => record(n, "SKIP", note);

/** assert-style helper: pass when cond is true, fail with note otherwise. */
function check(name, cond, note = "") {
  if (cond) pass(name, ""); else fail(name, note || "assertion failed");
  return !!cond;
}

/* ------------------------------------------------------------------ */
/* http                                                               */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rawRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const transport = url.protocol === "http:" ? http : https;
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: url.pathname + url.search,
        method,
        headers: Object.assign(
          { Accept: "application/json", Origin: FRONTEND, "User-Agent": "autosense-e2e/1.0" },
          payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}
        ),
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { /* non-JSON body */ }
          resolve({ status: res.statusCode, headers: res.headers, text, body: json });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out after 30s")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Request with 429 handling.  Both /api/diagnosis (8/min) and /api/bookings
 * (10/min) are rate limited per IP, so a full run can brush the limit; back
 * off and retry rather than reporting a false failure.
 */
async function request(method, path, body, { retries = 3 } = {}) {
  let res;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    res = await rawRequest(method, path, body);
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers["retry-after"]);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? (retryAfter + 1) * 1000
      : 15000;
    if (attempt === retries) break;
    info(`rate limited (429) on ${method} ${path} - waiting ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
  return res;
}

const get = (path) => request("GET", path);
const post = (path, body, opts) => request("POST", path, body, opts);

/* ------------------------------------------------------------------ */
/* dates                                                              */
/* ------------------------------------------------------------------ */

/** Today's date key in the shop's timezone, independent of this machine's. */
function shopTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const field = (t) => parts.find((p) => p.type === t).value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}

function nextDays(dateKey, n) {
  const d = new Date(dateKey + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* shared state across groups                                         */
/* ------------------------------------------------------------------ */

const state = {
  services: null,          // full /api/services list
  serviceByName: new Map(),
  bookingDate: null,       // first bookable date
  singleSlot: null,        // "HH:MM" used by groups 4 and 6
  multiSlot: null,         // "YYYY-MM-DD HH:MM" used by group 5
  references: [],          // every reference_id created (for cleanup SQL)
  diagnosisSummary: [],    // group 2 rows for the report
  // Every booking createBooking() managed to create, keyed by the label the
  // group passed ("single", "multi", "linked", ...).  Groups 8, 9 and 13 need
  // the reference id, the request body and the response body of a booking an
  // earlier group made, and reaching for them by label survives a group that
  // skipped or failed better than indexing into state.references.
  bookings: new Map(),
  contactEmails: [],       // contact_messages addresses created (cleanup SQL)
  manualNotes: [],         // things only a human or the DB can confirm
};

/** Email addresses the groups book with, reused by lookup and cancellation. */
const EMAILS = {
  single: "e2e-single@test.com",
  multi: "e2e-multi@test.com",
  linked: "e2e-linked@test.com",
  contact: "e2e-contact-test@test.com",
};

function serviceId(name) {
  const svc = state.serviceByName.get(name);
  return svc ? svc.id : null;
}

function bookingBody({ serviceIds, date, time, make, model, year, name, email, phone }) {
  return {
    serviceIds,
    vehicle: { make, model, year },
    contact: { fullName: name, email, phone },
    date,
    time,
  };
}

/** POST a booking, remember its reference id for cleanup, return the response. */
async function createBooking(label, body) {
  const res = await post("/api/bookings", body);
  const b = res.body || {};
  const ref = b.reference_id || b.referenceId ||
    (b.booking && (b.booking.reference_id || b.booking.referenceId)) || null;
  if (ref) {
    state.references.push(ref);
    state.bookings.set(label, { ref, request: body, response: b });
    info(`${label}: created ${ref} (HTTP ${res.status})`);
  } else {
    info(`${label}: HTTP ${res.status} ${res.text.slice(0, 200)}`);
  }
  return { res, ref };
}

const REF_PATTERN = /^AS-[A-Z0-9]{6}$/;

/* ================================================================== */
/* GROUP 1 - health and data endpoints                                */
/* ================================================================== */

async function group1() {
  group("TEST GROUP 1 - HEALTH AND DATA ENDPOINTS");

  // 1.1 health
  try {
    const res = await get("/api/health");
    const b = res.body || {};
    info(`health: ${res.text.slice(0, 180)}`);
    check("1.1a /api/health returns 200", res.status === 200, `got ${res.status}`);
    check("1.1b shop_time_zone is America/New_York",
      b.shop_time_zone === SHOP_TZ, `got ${JSON.stringify(b.shop_time_zone)}`);
    // shop_now is "YYYY-MM-DD HH:MM" in shop-local time.
    const parsed = typeof b.shop_now === "string"
      ? new Date(b.shop_now.replace(" ", "T") + ":00")
      : new Date(NaN);
    check("1.1c shop_now parses to a valid date",
      !Number.isNaN(parsed.getTime()), `shop_now=${JSON.stringify(b.shop_now)}`);
  } catch (e) {
    fail("1.1 /api/health", e.message);
  }

  // 1.2 services
  try {
    const res = await get("/api/services");
    const list = Array.isArray(res.body) ? res.body : (res.body && res.body.services) || null;
    if (!Array.isArray(list)) {
      fail("1.2 /api/services returns a list", `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } else {
      state.services = list;
      list.forEach((s) => state.serviceByName.set(s.name, s));
      info("services: " + list.map((s) => `${s.id}=${s.name}`).join(", "));
      check("1.2a /api/services returns 8 services", list.length === 8, `got ${list.length}`);
      const complete = list.every((s) =>
        Number.isInteger(s.id) && typeof s.name === "string" &&
        s.est_price_min != null && s.est_price_max != null &&
        s.est_duration_minutes != null);
      check("1.2b every service has id, name, price range and duration", complete,
        "a service is missing id/name/price/duration");
    }
  } catch (e) {
    fail("1.2 /api/services", e.message);
  }

  // 1.3 reviews
  try {
    const res = await get("/api/reviews");
    const list = Array.isArray(res.body) ? res.body : (res.body && res.body.reviews) || null;
    if (!Array.isArray(list) || list.length === 0) {
      fail("1.3 /api/reviews returns reviews", `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } else {
      info(`reviews: ${list.length} returned, ratings ${list.map((r) => r.rating).join("/")}`);
      check("1.3a every rating is between 1 and 5",
        list.every((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5),
        "a rating is out of range");
      const missing = list.filter((r) => typeof r.service_name !== "string" || !r.service_name);
      check("1.3b every review has a service_name", missing.length === 0,
        `${missing.length} review(s) without service_name`);
    }
  } catch (e) {
    fail("1.3 /api/reviews", e.message);
  }

  // 1.4 gallery, unfiltered then filtered
  try {
    const res = await get("/api/gallery");
    const list = Array.isArray(res.body) ? res.body : (res.body && res.body.images) || null;
    if (!Array.isArray(list) || list.length === 0) {
      fail("1.4 /api/gallery returns images", `HTTP ${res.status}: ${res.text.slice(0, 120)}`);
    } else {
      const categories = [...new Set(list.map((g) => g.category))];
      info(`gallery: ${list.length} images, categories: ${categories.join(", ")}`);
      check("1.4a /api/gallery returns images", list.length > 0, "empty gallery");

      // The spec asks for ?category=Interior.  Production has no Interior
      // category, so the correct behaviour is an empty result - assert that,
      // then prove the filter really works using a category that does exist.
      const interior = await get("/api/gallery?category=Interior");
      const iList = Array.isArray(interior.body) ? interior.body : [];
      check("1.4b ?category=Interior returns only Interior items",
        interior.status === 200 && iList.every((g) => g.category === "Interior"),
        `HTTP ${interior.status}, got categories ${[...new Set(iList.map((g) => g.category))].join(",")}`);
      info(`?category=Interior -> ${iList.length} items (no "Interior" category exists in production data)`);

      const real = categories[0];
      const filtered = await get(`/api/gallery?category=${encodeURIComponent(real)}`);
      const fList = Array.isArray(filtered.body) ? filtered.body : [];
      check(`1.4c ?category=${real} returns only that category`,
        filtered.status === 200 && fList.length > 0 && fList.every((g) => g.category === real),
        `HTTP ${filtered.status}, ${fList.length} items, categories ${[...new Set(fList.map((g) => g.category))].join(",")}`);
    }
  } catch (e) {
    fail("1.4 /api/gallery", e.message);
  }

  // 1.5 shop settings
  try {
    const res = await get("/api/shop-settings");
    const b = res.body || {};
    const name = b.shop_name || b.shopName;
    const hours = b.hours_json || b.hours || b.operating_hours;
    info(`shop-settings: name=${name}, max concurrent=${b.max_concurrent_appointments}, slot=${b.appointment_duration_minutes}min`);
    check("1.5a /api/shop-settings returns a shop name",
      typeof name === "string" && name.length > 0, `got ${JSON.stringify(name)}`);
    check("1.5b /api/shop-settings returns operating hours",
      hours && typeof hours === "object" && Object.keys(hours).length >= 7,
      `got ${JSON.stringify(hours).slice(0, 120)}`);
  } catch (e) {
    fail("1.5 /api/shop-settings", e.message);
  }
}

/* ================================================================== */
/* GROUP 2 - AI diagnosis quality                                     */
/* ================================================================== */

const DIAGNOSIS_CASES = [
  { description: "My brakes are squealing and it takes longer to stop", expect: "Brake Repair" },
  { description: "The engine light is on and the car shakes when idling", expect: "Engine Diagnostics" },
  { description: "My AC blows warm air even on the coldest setting", expect: "AC & Heating Repair" },
  { description: "The car pulls to one side when I drive straight", expect: "Tire Rotation & Alignment" },
  { description: "I need my oil changed, it's been about 6 months", expect: "Oil Change" },
  { description: "My car won't start at all, I had to get a jump", expect: "Battery Replacement" },
  { description: "There's a weird grinding sound when I shift gears", expect: "Transmission Service" },
  { description: "I want to buy a pizza", expect: "__REJECT__" },
];

async function group2() {
  group("TEST GROUP 2 - AI DIAGNOSIS QUALITY");

  if (!state.services) {
    DIAGNOSIS_CASES.forEach((c, i) =>
      skip(`2.${i + 1} diagnosis: "${c.description.slice(0, 38)}..."`,
        "services list unavailable (test 1.2 failed)"));
    return;
  }

  const idToName = new Map(state.services.map((s) => [s.id, s.name]));

  for (let i = 0; i < DIAGNOSIS_CASES.length; i += 1) {
    const c = DIAGNOSIS_CASES[i];
    const label = `2.${i + 1} diagnosis: "${c.description.slice(0, 38)}${c.description.length > 38 ? "..." : ""}"`;

    // Space the calls out: /api/diagnosis allows 8 requests per minute per IP
    // and this group plus test 7.4 makes nine.
    if (i > 0) await sleep(8000);

    try {
      const res = await post("/api/diagnosis", {
        description: c.description, make: "Toyota", model: "Camry", year: "2020",
      });

      if (res.status !== 200) {
        fail(label, `HTTP ${res.status}: ${res.text.slice(0, 140)}`);
        state.diagnosisSummary.push({
          description: c.description, matched: `HTTP ${res.status}`, cost: "-", time: "-", ok: false,
        });
        continue;
      }

      const b = res.body || {};
      const matchedName = b.suggestedServiceId != null
        ? (idToName.get(b.suggestedServiceId) || `service #${b.suggestedServiceId}`)
        : null;
      const cost = b.estCostMin != null ? `$${b.estCostMin}-$${b.estCostMax}` : "none";
      const time = b.estTimeMinHours != null ? `${b.estTimeMinHours}-${b.estTimeMaxHours}h` : "none";

      info(`matched service: ${matchedName || "(none)"} | code: ${b.matchedCode ? b.matchedCode.code : "none"} | cost: ${cost} | time: ${time} | confidence: ${b.confidence}`);
      info(`summary: ${String(b.summary || "").slice(0, 170)}`);

      let ok;
      if (c.expect === "__REJECT__") {
        // Non-automotive input must be flagged out of context and must not be
        // matched to any car service.
        ok = b.outOfContext === true && b.suggestedServiceId == null && b.matchedCode == null;
        if (ok) pass(label, "correctly rejected as non-automotive");
        else fail(label, `NOT rejected - outOfContext=${b.outOfContext}, suggestedServiceId=${b.suggestedServiceId} (${matchedName})`);
      } else {
        ok = matchedName === c.expect;
        if (ok) pass(label, `-> ${matchedName}`);
        else fail(label, `expected ${c.expect}, got ${matchedName || "(none)"}`);
        // Flag a nonsensical result loudly, beyond the pass/fail line.
        if (!ok) {
          console.log(C.yellow + `    !! MISMATCH: "${c.description}" matched ${matchedName || "(none)"}, expected ${c.expect}` + C.reset);
        }
        // A sensible estimate also carries a cost and a time range.
        check(`2.${i + 1}b cost and time ranges present`,
          b.estCostMin != null && b.estCostMax != null &&
          b.estTimeMinHours != null && b.estTimeMaxHours != null,
          `cost=${cost}, time=${time}`);
      }

      state.diagnosisSummary.push({
        description: c.description,
        matched: c.expect === "__REJECT__"
          ? (b.outOfContext ? "rejected (out of context)" : matchedName || "(none)")
          : matchedName || "(none)",
        cost, time, ok,
      });
    } catch (e) {
      fail(label, e.message);
      state.diagnosisSummary.push({
        description: c.description, matched: "error", cost: "-", time: "-", ok: false,
      });
    }
  }
}

/* ================================================================== */
/* GROUP 3 - availability                                             */
/* ================================================================== */

async function group3() {
  group("TEST GROUP 3 - AVAILABILITY");

  const today = shopTodayKey();
  const [year, month] = today.split("-").map(Number);

  try {
    // Live contract: ?year=YYYY&month=M, not month=YYYY-MM.
    const res = await get(`/api/availability/month?year=${year}&month=${month}`);
    const b = res.body || {};
    const days = Array.isArray(b.days) ? b.days : null;

    if (!days) {
      fail("3.1a /api/availability/month returns days", `HTTP ${res.status}: ${res.text.slice(0, 140)}`);
    } else {
      const shopToday = b.shop_today || b.shopToday;
      info(`month ${year}-${String(month).padStart(2, "0")}: shop_today=${shopToday}, ${days.length} days, ${days.filter((d) => d.is_available).length} available`);
      check("3.1a shop_today equals today's date in the shop timezone",
        shopToday === today, `shop_today=${shopToday}, expected ${today}`);

      const badPast = days.filter((d) => d.date < today && d.is_available);
      check("3.1b every date before shop_today is unavailable",
        badPast.length === 0,
        `${badPast.length} past date(s) still available: ${badPast.map((d) => d.date).join(",")}`);

      // First bookable date: today or later with an open slot.
      const candidate = days.find((d) => d.date >= today && d.is_available);
      if (candidate) {
        state.bookingDate = candidate.date;
        pass("3.1c found a bookable future date", `${candidate.date} (${candidate.open_slot_count} open slots)`);
      } else {
        fail("3.1c found a bookable future date", "no available date this month");
      }
    }
  } catch (e) {
    fail("3.1 /api/availability/month", e.message);
  }

  if (!state.bookingDate) {
    skip("3.2a /api/availability/day returns time slots", "no bookable date from test 3.1");
    skip("3.2b found an available time slot", "no bookable date from test 3.1");
    return;
  }

  try {
    const res = await get(`/api/availability/day?date=${state.bookingDate}`);
    // Live contract: a bare array of { date, time, is_available }.
    const slots = Array.isArray(res.body) ? res.body : (res.body && res.body.slots) || null;
    if (!Array.isArray(slots)) {
      fail("3.2a /api/availability/day returns time slots", `HTTP ${res.status}: ${res.text.slice(0, 140)}`);
      skip("3.2b found an available time slot", "day endpoint did not return slots");
      return;
    }
    const open = slots.filter((s) => s.is_available || s.available);
    info(`day ${state.bookingDate}: ${slots.length} slots, open: ${open.map((s) => s.time).join(", ") || "(none)"}`);
    check("3.2a /api/availability/day returns time slots", slots.length > 0, "empty slot grid");
    if (open.length > 0) {
      state.singleSlot = open[0].time;
      pass("3.2b found an available time slot", `${state.singleSlot}`);
    } else {
      fail("3.2b found an available time slot", `no open slot on ${state.bookingDate}`);
    }
  } catch (e) {
    fail("3.2 /api/availability/day", e.message);
  }
}

/* ================================================================== */
/* GROUP 4 - single service booking                                   */
/* ================================================================== */

async function group4() {
  group("TEST GROUP 4 - SINGLE SERVICE BOOKING");

  const id = serviceId("General Inspection");
  if (!state.bookingDate || !state.singleSlot || !id) {
    const why = !id
      ? "General Inspection service id unavailable (test 1.2 failed)"
      : "no date/slot from test group 3";
    skip("4.1 single-service booking created (201)", why);
    skip("4.2 referenceId matches AS-[A-Z0-9]{6}", "booking not created");
    skip("4.3 response echoes the requested date and time", "booking not created");
    return;
  }

  const { res, ref } = await createBooking("single", bookingBody({
    serviceIds: [id],
    date: state.bookingDate,
    time: state.singleSlot,
    make: "Honda", model: "Accord", year: "2022",
    name: "E2E Test Single", email: "e2e-single@test.com", phone: "5550001111",
  }));

  const created = check("4.1 single-service booking created (201)",
    res.status === 201 || res.status === 200,
    `HTTP ${res.status}: ${res.text.slice(0, 160)}`);

  if (!created) {
    skip("4.2 referenceId matches AS-[A-Z0-9]{6}", "booking not created");
    skip("4.3 response echoes the requested date and time", "booking not created");
    return;
  }

  check("4.2 referenceId matches AS-[A-Z0-9]{6}", REF_PATTERN.test(ref || ""), `got ${JSON.stringify(ref)}`);
  const echoedDate = res.body && (res.body.date || res.body.appointment_date);
  check("4.3 response echoes the requested date and time",
    echoedDate === state.bookingDate,
    `expected ${state.bookingDate}, got ${echoedDate}`);
}

/* ================================================================== */
/* GROUP 5 - multi-service booking                                    */
/* ================================================================== */

async function group5() {
  group("TEST GROUP 5 - MULTI-SERVICE BOOKING");

  const ids = [serviceId("Oil Change"), serviceId("Tire Rotation & Alignment")];
  if (!state.bookingDate || ids.some((i) => !i)) {
    const why = ids.some((i) => !i)
      ? "service ids unavailable (test 1.2 failed)"
      : "no date from test group 3";
    skip("5.1 multi-service booking created (201)", why);
    skip("5.2 referenceId valid for multi-service booking", "booking not created");
    skip("5.3 both service ids recorded on the booking", "booking not created");
    return;
  }

  // Re-query availability *for this service combination* (two services means a
  // longer appointment, so the open slots differ) and pick one that is not the
  // slot group 4 used, so this booking cannot interfere with group 6.
  let date = state.bookingDate;
  let slot = null;
  const qs = `serviceIds=${ids.join(",")}`;
  const candidateDates = [state.bookingDate, nextDays(state.bookingDate, 1), nextDays(state.bookingDate, 2)];

  for (const candidateDate of candidateDates) {
    const res = await get(`/api/availability/day?date=${candidateDate}&${qs}`);
    const slots = Array.isArray(res.body) ? res.body : [];
    const open = slots.filter((s) => s.is_available && s.time !== state.singleSlot);
    info(`day ${candidateDate} (services ${ids.join("+")}): open ${open.map((s) => s.time).join(", ") || "(none)"}`);
    if (open.length > 0) {
      // Take the last open slot, well clear of group 4's booking window.
      date = candidateDate;
      slot = open[open.length - 1].time;
      break;
    }
  }

  if (!slot) {
    fail("5.1 multi-service booking created (201)", "no open slot for the two-service duration");
    skip("5.2 referenceId valid for multi-service booking", "booking not created");
    skip("5.3 both service ids recorded on the booking", "booking not created");
    return;
  }
  state.multiSlot = `${date} ${slot}`;

  const { res, ref } = await createBooking("multi", bookingBody({
    serviceIds: ids,
    date, time: slot,
    make: "Ford", model: "F-150", year: "2021",
    name: "E2E Test Multi", email: "e2e-multi@test.com", phone: "5550002222",
  }));

  const created = check("5.1 multi-service booking created (201)",
    res.status === 201 || res.status === 200,
    `HTTP ${res.status}: ${res.text.slice(0, 160)}`);

  if (!created) {
    skip("5.2 referenceId valid for multi-service booking", "booking not created");
    skip("5.3 both service ids recorded on the booking", "booking not created");
    return;
  }

  check("5.2 referenceId valid for multi-service booking", REF_PATTERN.test(ref || ""), `got ${JSON.stringify(ref)}`);
  const returnedIds = (res.body && (res.body.serviceIds || res.body.service_ids)) || [];
  check("5.3 both service ids recorded on the booking",
    Array.isArray(returnedIds) && ids.every((i) => returnedIds.includes(i)),
    `got ${JSON.stringify(returnedIds)}`);
}

/* ================================================================== */
/* GROUP 6 - concurrency / double booking protection                  */
/* ================================================================== */

async function group6() {
  group("TEST GROUP 6 - CONCURRENCY / DOUBLE BOOKING PROTECTION");

  const id = serviceId("General Inspection");
  const haveSlot = state.references.length > 0 && state.bookingDate && state.singleSlot;
  if (!haveSlot || !id) {
    skip("6.1 slot fills to max_concurrent_appointments (2nd booking accepted)",
      "no successful booking from test group 4");
    skip("6.2 third booking on a full slot is rejected with 409", "slot never filled");
    skip("6.3 409 response names the capacity clash", "slot never filled");
    return;
  }

  const date = state.bookingDate;
  const time = state.singleSlot;
  info(`filling ${date} ${time} to capacity (max_concurrent_appointments = 2), then expecting 409`);

  // Group 4 took one of the two bays at this slot; this fills the second.
  const second = await createBooking("race#1", bookingBody({
    serviceIds: [id], date, time,
    make: "Toyota", model: "Corolla", year: "2019",
    name: "E2E Test Race", email: "e2e-race@test.com", phone: "5550003333",
  }));

  const filled = check("6.1 slot fills to max_concurrent_appointments (2nd booking accepted)",
    second.res.status === 201 || second.res.status === 200,
    `HTTP ${second.res.status}: ${second.res.text.slice(0, 160)}`);

  if (!filled) {
    skip("6.2 third booking on a full slot is rejected with 409", "could not fill the slot to capacity");
    skip("6.3 409 response names the capacity clash", "could not fill the slot to capacity");
    return;
  }

  // A third attempt on a slot now holding two appointments must be refused.
  const third = await createBooking("race#2 (expect 409)", bookingBody({
    serviceIds: [id], date, time,
    make: "Toyota", model: "Corolla", year: "2019",
    name: "E2E Test Race", email: "e2e-race@test.com", phone: "5550003333",
  }));

  const rejected = check("6.2 third booking on a full slot is rejected with 409",
    third.res.status === 409,
    `expected 409, got ${third.res.status}: ${third.res.text.slice(0, 160)}`);

  if (rejected) {
    info(`409 body: ${third.res.text.slice(0, 200)}`);
    check("6.3 409 response names the capacity clash",
      /at_capacity|SLOT_TAKEN|just booked/i.test(third.res.text),
      `body did not identify a capacity clash: ${third.res.text.slice(0, 160)}`);
  } else {
    skip("6.3 409 response names the capacity clash", "third booking was not rejected");
  }
}

/* ================================================================== */
/* GROUP 7 - validation and error handling                            */
/* ================================================================== */

async function group7() {
  group("TEST GROUP 7 - VALIDATION AND ERROR HANDLING");

  const id = serviceId("General Inspection") || 8;
  const date = state.bookingDate || nextDays(shopTodayKey(), 1);
  const time = state.singleSlot || "10:00";
  const base = {
    make: "Honda", model: "Accord", year: "2022",
    name: "E2E Test Validation", email: "e2e-validation@test.com", phone: "5550004444",
  };

  // 7.1 empty services array
  try {
    const body = bookingBody(Object.assign({ serviceIds: [], date, time }, base));
    const res = await post("/api/bookings", body);
    info(`empty services -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("7.1 empty services array rejected with 400", res.status === 400, `got ${res.status}`);
  } catch (e) { fail("7.1 empty services array rejected with 400", e.message); }

  // 7.2 past date
  try {
    const body = bookingBody(Object.assign({ serviceIds: [id], date: "2020-01-01", time }, base));
    const res = await post("/api/bookings", body);
    info(`past date -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("7.2 past date rejected with 400", res.status === 400, `got ${res.status}`);
  } catch (e) { fail("7.2 past date rejected with 400", e.message); }

  // 7.3 missing customer name
  try {
    const body = bookingBody(Object.assign({ serviceIds: [id], date, time }, base));
    delete body.contact.fullName;
    const res = await post("/api/bookings", body);
    info(`missing name -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("7.3 missing customerName rejected with 400", res.status === 400, `got ${res.status}`);
  } catch (e) { fail("7.3 missing customerName rejected with 400", e.message); }

  // 7.4 empty diagnosis description
  try {
    const res = await post("/api/diagnosis", {
      description: "", make: "Toyota", model: "Camry", year: "2020",
    });
    info(`empty description -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("7.4 empty diagnosis description rejected with 400", res.status === 400, `got ${res.status}`);
  } catch (e) { fail("7.4 empty diagnosis description rejected with 400", e.message); }
}

/* ================================================================== */
/* GROUP 8 - booking lookup                                           */
/* ================================================================== */

/** Open slots for a date, optionally for a specific service combination. */
async function daySlots(date, serviceIds = []) {
  const qs = serviceIds.length > 0 ? `&serviceIds=${serviceIds.join(",")}` : "";
  const res = await get(`/api/availability/day?date=${date}${qs}`);
  return Array.isArray(res.body) ? res.body : [];
}

async function group8() {
  group("TEST GROUP 8 - BOOKING LOOKUP");

  const single = state.bookings.get("single");
  if (!single) {
    ["8.1 lookup returns the booking", "8.2 lookup with the wrong email returns 404",
     "8.3 lookup with an unknown reference returns 404",
     "8.4 lookup without referenceId or email returns 400"].forEach((n) =>
      skip(n, "no booking from test group 4"));
    return;
  }

  // 8.1 the real pair
  try {
    const res = await get(
      `/api/bookings/lookup?referenceId=${encodeURIComponent(single.ref)}&email=${encodeURIComponent(EMAILS.single)}`
    );
    const b = (res.body && res.body.booking) || null;
    info(`lookup ${single.ref} -> HTTP ${res.status} ${res.text.slice(0, 180)}`);

    if (!check("8.1a lookup returns the booking (200)", res.status === 200 && !!b,
      `HTTP ${res.status}: ${res.text.slice(0, 160)}`)) {
      ["8.1b lookup echoes the reference and a live status",
       "8.1c lookup returns the booked service",
       "8.1d lookup returns the vehicle",
       "8.1e lookup returns the booked date and time"].forEach((n) =>
        skip(n, "lookup did not return a booking"));
    } else {
      check("8.1b lookup echoes the reference and a live status",
        b.reference_id === single.ref && ["pending", "confirmed"].includes(b.status),
        `reference_id=${b.reference_id}, status=${b.status}`);

      const names = (b.services || []).map((s) => s.name);
      check("8.1c lookup returns the booked service",
        names.includes("General Inspection"),
        `services=${JSON.stringify(names)}`);

      const v = b.vehicle || {};
      const want = single.request.vehicle;
      check("8.1d lookup returns the vehicle",
        v.make === want.make && v.model === want.model && String(v.year) === String(want.year),
        `got ${JSON.stringify(v)}, expected ${JSON.stringify(want)}`);

      check("8.1e lookup returns the booked date and time",
        b.appointment_date === single.request.date && b.appointment_time === single.request.time,
        `got ${b.appointment_date} ${b.appointment_time}, expected ${single.request.date} ${single.request.time}`);
    }
  } catch (e) {
    fail("8.1a lookup returns the booking (200)", e.message);
  }

  // 8.2 right reference, wrong email
  try {
    const res = await get(
      `/api/bookings/lookup?referenceId=${encodeURIComponent(single.ref)}&email=wrong-email@test.com`
    );
    info(`wrong email -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("8.2 lookup with the wrong email returns 404", res.status === 404, `got ${res.status}`);
  } catch (e) { fail("8.2 lookup with the wrong email returns 404", e.message); }

  // 8.3 reference that does not exist
  try {
    const res = await get(
      `/api/bookings/lookup?referenceId=AS-ZZZZZZ&email=${encodeURIComponent(EMAILS.single)}`
    );
    info(`fake reference -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("8.3 lookup with an unknown reference returns 404", res.status === 404, `got ${res.status}`);
  } catch (e) { fail("8.3 lookup with an unknown reference returns 404", e.message); }

  // 8.4 missing parameters
  try {
    const noRef = await get(`/api/bookings/lookup?email=${encodeURIComponent(EMAILS.single)}`);
    const noEmail = await get(`/api/bookings/lookup?referenceId=${encodeURIComponent(single.ref)}`);
    info(`no referenceId -> HTTP ${noRef.status}; no email -> HTTP ${noEmail.status}`);
    check("8.4 lookup without referenceId or email returns 400",
      noRef.status === 400 && noEmail.status === 400,
      `no referenceId: ${noRef.status}, no email: ${noEmail.status}`);
  } catch (e) { fail("8.4 lookup without referenceId or email returns 400", e.message); }
}

/* ================================================================== */
/* GROUP 9 - booking cancellation                                     */
/* ================================================================== */

async function group9() {
  group("TEST GROUP 9 - BOOKING CANCELLATION");

  // Cancel the multi-service booking: group 8 already asserted the single
  // booking is live, and this one's slot is not the one group 6 filled to
  // capacity, so freeing it is observable in test 9.5.
  const target = state.bookings.get("multi");
  const names = [
    "9.1 cancellation succeeds and reports status cancelled",
    "9.2 cancelling the same booking again returns 400",
    "9.3 cancelling with the wrong email returns 404",
    "9.4 the cancelled booking looks up as cancelled",
    "9.5 the cancelled slot is available again",
  ];

  if (!target) {
    names.forEach((n) => skip(n, "no booking from test group 5"));
    return;
  }

  const date = target.request.date;
  const time = target.request.time;
  const serviceIds = target.request.serviceIds || [];

  // Availability for this slot *before* the cancellation, so 9.5 can show the
  // change rather than only the end state.  The shop allows two concurrent
  // appointments, so the slot may well read as available either way; the open
  // slot count is what moves.
  let beforeSlot = null;
  try {
    beforeSlot = (await daySlots(date, serviceIds)).find((s) => s.time === time) || null;
    info(`before cancel: ${date} ${time} is_available=${beforeSlot ? beforeSlot.is_available : "(slot not in grid)"}`);
  } catch (e) {
    info(`before cancel: availability check failed - ${e.message}`);
  }

  // 9.1 cancel it
  let cancelled = false;
  try {
    const res = await post("/api/bookings/cancel", {
      referenceId: target.ref,
      email: EMAILS.multi,
    });
    const b = (res.body && res.body.booking) || {};
    info(`cancel ${target.ref} -> HTTP ${res.status} ${res.text.slice(0, 180)}`);
    cancelled = check("9.1 cancellation succeeds and reports status cancelled",
      res.status === 200 && res.body && res.body.success === true && b.status === "cancelled",
      `HTTP ${res.status}: ${res.text.slice(0, 160)}`);
  } catch (e) { fail("9.1 cancellation succeeds and reports status cancelled", e.message); }

  // 9.2 cancel it again
  try {
    const res = await post("/api/bookings/cancel", {
      referenceId: target.ref,
      email: EMAILS.multi,
    });
    info(`second cancel -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("9.2 cancelling the same booking again returns 400",
      res.status === 400, `got ${res.status}: ${res.text.slice(0, 140)}`);
  } catch (e) { fail("9.2 cancelling the same booking again returns 400", e.message); }

  // 9.3 wrong email.  Uses the still-live single booking so a 404 can only
  // come from the email mismatch, not from an already-cancelled booking.
  const live = state.bookings.get("single") || target;
  try {
    const res = await post("/api/bookings/cancel", {
      referenceId: live.ref,
      email: "wrong-email@test.com",
    });
    info(`cancel with wrong email -> HTTP ${res.status} ${res.text.slice(0, 140)}`);
    check("9.3 cancelling with the wrong email returns 404",
      res.status === 404, `got ${res.status}: ${res.text.slice(0, 140)}`);
  } catch (e) { fail("9.3 cancelling with the wrong email returns 404", e.message); }

  // 9.4 lookup shows the cancellation
  try {
    const res = await get(
      `/api/bookings/lookup?referenceId=${encodeURIComponent(target.ref)}&email=${encodeURIComponent(EMAILS.multi)}`
    );
    const b = (res.body && res.body.booking) || {};
    info(`lookup after cancel -> HTTP ${res.status} status=${b.status}`);
    check("9.4 the cancelled booking looks up as cancelled",
      res.status === 200 && b.status === "cancelled",
      `HTTP ${res.status}, status=${b.status}`);
  } catch (e) { fail("9.4 the cancelled booking looks up as cancelled", e.message); }

  // 9.5 the freed slot
  if (!cancelled) {
    skip("9.5 the cancelled slot is available again", "cancellation did not succeed");
    return;
  }
  try {
    const after = (await daySlots(date, serviceIds)).find((s) => s.time === time) || null;
    const beforeCount = beforeSlot ? beforeSlot.open_slot_count : undefined;
    info(`after cancel: ${date} ${time} is_available=${after ? after.is_available : "(slot not in grid)"}`);
    check("9.5 the cancelled slot is available again",
      !!after && after.is_available === true,
      after ? `is_available=${after.is_available} (was ${beforeSlot && beforeSlot.is_available}${beforeCount !== undefined ? `, count ${beforeCount}` : ""})`
            : `slot ${time} not present in the grid for ${date}`);
  } catch (e) { fail("9.5 the cancelled slot is available again", e.message); }
}

/* ================================================================== */
/* GROUP 10 - contact form                                            */
/* ================================================================== */

async function group10() {
  group("TEST GROUP 10 - CONTACT FORM");

  const valid = {
    name: "Test User",
    email: EMAILS.contact,
    phone: "5550009999",
    message: "This is an automated test message.",
  };

  // 10.1 a complete message
  try {
    const res = await post("/api/contact", valid);
    info(`valid contact -> HTTP ${res.status} ${res.text.slice(0, 180)}`);
    const ok = check("10.1 valid contact message accepted (201)",
      (res.status === 201 || res.status === 200) && res.body && res.body.success === true,
      `HTTP ${res.status}: ${res.text.slice(0, 160)}`);
    if (ok) state.contactEmails.push(EMAILS.contact);
  } catch (e) { fail("10.1 valid contact message accepted (201)", e.message); }

  // 10.2 - 10.5 each required field in turn, plus an empty message string
  const bad = [
    ["10.2 contact without a name rejected with 400", (b) => { delete b.name; }],
    ["10.3 contact without an email rejected with 400", (b) => { delete b.email; }],
    ["10.4 contact without a message rejected with 400", (b) => { delete b.message; }],
    ["10.5 contact with an empty message rejected with 400", (b) => { b.message = ""; }],
  ];

  for (const [name, mutate] of bad) {
    try {
      const body = Object.assign({}, valid);
      mutate(body);
      const res = await post("/api/contact", body);
      info(`${name.slice(0, 4)}-> HTTP ${res.status} ${res.text.slice(0, 120)}`);
      check(name, res.status === 400, `got ${res.status}: ${res.text.slice(0, 120)}`);
    } catch (e) { fail(name, e.message); }
  }
}

/* ================================================================== */
/* GROUP 11 - diagnosis to booking link                               */
/* ================================================================== */

const LINKED_DIAGNOSIS_DESCRIPTION =
  "My brakes are squealing and it takes longer to stop";

async function group11() {
  group("TEST GROUP 11 - DIAGNOSIS TO BOOKING LINK");

  const names = [
    "11.1 diagnosis returns a request id",
    "11.2 booking accepts diagnosisRequestId (201)",
    "11.3 linked booking has a valid referenceId",
  ];

  // /api/diagnosis is limited to 8 per minute per IP and group 2 has already
  // spent several; keep the same 8s pacing the earlier groups use.
  await sleep(9000);

  let diagnosis = null;
  try {
    const res = await post("/api/diagnosis", {
      description: LINKED_DIAGNOSIS_DESCRIPTION,
      make: "Honda", model: "Civic", year: "2021",
    });
    diagnosis = res.body || {};
    // The endpoint names it `id`; accept the other two spellings in case that
    // ever changes.
    const requestId = diagnosis.id ?? diagnosis.requestId ?? diagnosis.diagnosisRequestId ?? null;
    info(`diagnosis -> HTTP ${res.status} id=${requestId} suggestedServiceId=${diagnosis.suggestedServiceId}`);

    if (!check("11.1 diagnosis returns a request id",
      res.status === 200 && Number.isInteger(requestId),
      `HTTP ${res.status}, id=${JSON.stringify(requestId)}`)) {
      names.slice(1).forEach((n) => skip(n, "no diagnosis request id"));
      return;
    }
    diagnosis.requestId = requestId;
  } catch (e) {
    fail("11.1 diagnosis returns a request id", e.message);
    names.slice(1).forEach((n) => skip(n, "diagnosis call failed"));
    return;
  }

  // Book the service the diagnosis matched, on a slot none of the earlier
  // groups used.
  const matchedServiceId = diagnosis.suggestedServiceId || serviceId("General Inspection");
  if (!matchedServiceId) {
    names.slice(1).forEach((n) => skip(n, "no service id to book"));
    return;
  }

  const taken = new Set([state.singleSlot, (state.multiSlot || "").split(" ")[1]]);
  const start = state.bookingDate || nextDays(shopTodayKey(), 1);
  let date = null;
  let time = null;

  for (const candidate of [start, nextDays(start, 1), nextDays(start, 2), nextDays(start, 3)]) {
    const slots = await daySlots(candidate, [matchedServiceId]);
    const open = slots.filter((s) => s.is_available && !(candidate === start && taken.has(s.time)));
    info(`day ${candidate} (service ${matchedServiceId}): open ${open.map((s) => s.time).join(", ") || "(none)"}`);
    if (open.length > 0) {
      date = candidate;
      time = open[open.length - 1].time;
      break;
    }
  }

  if (!time) {
    names.slice(1).forEach((n) => skip(n, "no free slot for the matched service"));
    return;
  }

  const body = Object.assign(
    bookingBody({
      serviceIds: [matchedServiceId],
      date, time,
      make: "Honda", model: "Civic", year: "2021",
      name: "E2E Test Linked", email: EMAILS.linked, phone: "5550004444",
    }),
    { diagnosisRequestId: diagnosis.requestId }
  );

  const { res, ref } = await createBooking("linked", body);
  const created = check("11.2 booking accepts diagnosisRequestId (201)",
    res.status === 201 || res.status === 200,
    `HTTP ${res.status}: ${res.text.slice(0, 160)}`);

  if (!created) {
    skip("11.3 linked booking has a valid referenceId", "booking not created");
    return;
  }

  check("11.3 linked booking has a valid referenceId",
    REF_PATTERN.test(ref || ""), `got ${JSON.stringify(ref)}`);

  state.manualNotes.push(
    `diagnosis_requests id ${diagnosis.requestId} should now read status='converted_to_booking' ` +
    `(linked to booking ${ref}) - the API exposes no way to read it, so check the DB:\n` +
    `       SELECT id, status FROM diagnosis_requests WHERE id = ${diagnosis.requestId};`
  );
  info("manual DB verification needed: diagnosis_requests.status -> 'converted_to_booking'");
}

/* ================================================================== */
/* GROUP 12 - 404 page (browser only)                                 */
/* ================================================================== */

async function group12() {
  group("TEST GROUP 12 - 404 PAGE");
  skip("12.1 unknown route shows the 404 page",
    `MANUAL - verify ${FRONTEND}/some-fake-page shows the 404 page in a browser`);
  state.manualNotes.push(
    `MANUAL - open ${FRONTEND}/some-fake-page in a browser and confirm the 404 page renders ` +
    "(heading \"Page not found\") inside the normal header/footer layout."
  );
}

/* ================================================================== */
/* GROUP 13 - email confirmation flag                                 */
/* ================================================================== */

async function group13() {
  group("TEST GROUP 13 - EMAIL CONFIRMATION FLAG");

  // Reuse a booking an earlier group already created rather than spending
  // another slot and another row in the production database.
  const entry = state.bookings.get("single") || state.bookings.get("linked") ||
    state.bookings.get("multi") || null;

  if (!entry) {
    skip("13.1 booking response carries an email_sent flag", "no booking was created this run");
    skip("13.2 email_sent is false while SMTP is unconfigured", "no booking was created this run");
    return;
  }

  const body = entry.response || {};
  const flag = body.email_sent ?? body.emailSent;
  info(`booking ${entry.ref}: email_sent=${JSON.stringify(flag)}`);

  if (!check("13.1 booking response carries an email_sent flag", typeof flag === "boolean",
    `got ${JSON.stringify(flag)} - keys: ${Object.keys(body).join(", ")}`)) {
    skip("13.2 email_sent is false while SMTP is unconfigured", "no flag in the response");
    return;
  }

  if (flag === false) {
    pass("13.2 email_sent is false while SMTP is unconfigured", "");
  } else {
    // Not a defect if the shop has since configured SMTP - say so plainly
    // rather than reporting a failure the code did not cause.
    skip("13.2 email_sent is false while SMTP is unconfigured",
      "email_sent is true, so SMTP is now configured; a confirmation email went out");
  }
}

/* ================================================================== */
/* final report                                                       */
/* ================================================================== */

function report() {
  group("DIAGNOSIS RESULTS");
  if (state.diagnosisSummary.length === 0) {
    info("no diagnosis results (group 2 skipped)");
  } else {
    const w = 52;
    console.log(C.bold + "     " + "DESCRIPTION".padEnd(w) + "MATCHED".padEnd(28) + "COST".padEnd(14) + "TIME" + C.reset);
    for (const r of state.diagnosisSummary) {
      const mark = r.ok ? C.green + " ok  " + C.reset : C.red + " !!  " + C.reset;
      console.log(mark + r.description.slice(0, w - 2).padEnd(w) +
        String(r.matched).padEnd(28) + r.cost.padEnd(14) + r.time);
    }
  }

  group("SUMMARY");
  const nameWidth = Math.min(74, Math.max(10, ...results.map((r) => r.name.length)));
  console.log(C.bold + "  " + "TEST".padEnd(nameWidth) + "  RESULT  NOTE" + C.reset);
  console.log("  " + "-".repeat(nameWidth) + "  ------  " + "-".repeat(40));
  for (const r of results) {
    const colour = r.status === "PASS" ? C.green : r.status === "FAIL" ? C.red : C.yellow;
    console.log("  " + r.name.padEnd(nameWidth) + "  " + colour + r.status.padEnd(6) + C.reset +
      "  " + (r.status === "PASS" ? "" : r.note));
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log("");
  console.log(`  ${C.green}PASSED: ${passed}${C.reset}   ${C.red}FAILED: ${failed}${C.reset}   ${C.yellow}SKIPPED: ${skipped}${C.reset}   TOTAL: ${results.length}`);

  if (state.manualNotes.length > 0) {
    group("MANUAL VERIFICATION");
    for (const note of state.manualNotes) {
      console.log("  - " + note);
    }
  }

  group("CLEANUP SQL");
  const sql = [];

  if (state.references.length > 0) {
    const list = state.references.map((r) => `'${r}'`).join(", ");
    sql.push(`-- ${state.references.length} test booking(s) created by this run`);
    // Bookings first: a linked booking holds a foreign key into
    // diagnosis_requests, so the rows below cannot go before it.
    sql.push(`DELETE FROM booking_services WHERE booking_id IN (SELECT id FROM bookings WHERE reference_id IN (${list}));`);
    sql.push(`DELETE FROM bookings WHERE reference_id IN (${list});`);
  }

  if (state.contactEmails.length > 0) {
    const emails = [...new Set(state.contactEmails)].map((e) => `'${e}'`).join(", ");
    sql.push("");
    sql.push("-- contact messages created by test group 10");
    sql.push(`DELETE FROM contact_messages WHERE email IN (${emails});`);
  }

  // Every diagnosis call in this suite writes a diagnosis_requests row (and
  // child rows in diagnosis_request_codes when a diagnostic code matched).
  const descriptions = [...new Set([
    ...DIAGNOSIS_CASES.map((c) => c.description),
    LINKED_DIAGNOSIS_DESCRIPTION,
  ])].map((d) => `'${d.replace(/'/g, "''")}'`);

  sql.push("");
  sql.push("-- diagnosis requests created by test groups 2 and 11");
  sql.push("DELETE FROM diagnosis_request_codes WHERE diagnosis_request_id IN (");
  sql.push(`  SELECT id FROM diagnosis_requests WHERE customer_description IN (`);
  sql.push("    " + descriptions.join(",\n    "));
  sql.push("  )");
  sql.push(");");
  sql.push("DELETE FROM diagnosis_requests WHERE customer_description IN (");
  sql.push("  " + descriptions.join(",\n  "));
  sql.push(");");

  if (state.references.length === 0 && state.contactEmails.length === 0) {
    console.log("  -- No bookings or contact messages were created during this run.");
  }
  console.log(sql.join("\n"));
  console.log("");

  return failed;
}

/* ================================================================== */

/* ================================================================== */
/* target guard                                                       */
/* ================================================================== */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isLocalTarget(base) {
  try {
    return LOCAL_HOSTS.has(new URL(base).hostname);
  } catch {
    return false;
  }
}

/**
 * Refuse to touch anything that is not localhost unless CONFIRM_PROD=yes.
 * Returns true when the run may proceed; prints and returns false otherwise.
 * Called before the first request, so a blocked run sends nothing at all.
 */
function confirmTarget() {
  if (isLocalTarget(API)) return true;

  const host = (() => {
    try { return new URL(API).host; } catch { return API; }
  })();

  console.log("");
  console.log(C.bold + C.yellow + "!".repeat(72) + C.reset);
  console.log(C.bold + C.yellow + "  WARNING: this is not a local target." + C.reset);
  console.log(C.bold + C.yellow + "!".repeat(72) + C.reset);
  console.log("");
  console.log(`  Target host: ${C.bold}${host}${C.reset}`);
  console.log("");
  console.log("  This suite writes to the database behind that host.  It will create");
  console.log("  real bookings that hold real appointment slots, real diagnosis requests");
  console.log("  and real contact messages.  None of it is rolled back.");

  if (process.env.CONFIRM_PROD === "yes") {
    console.log("");
    console.log(`  ${C.green}CONFIRM_PROD=yes is set - proceeding.${C.reset}`);
    console.log("  Run the cleanup SQL printed at the end of the run against this database.");
    return true;
  }

  console.log("");
  console.log(`  ${C.red}Refusing to run.${C.reset}  No request has been sent.`);
  console.log("");
  console.log("  To run against this host anyway, set CONFIRM_PROD=yes and be ready to");
  console.log("  clean up afterwards:");
  console.log("");
  console.log(`    API_BASE=${API} CONFIRM_PROD=yes node backend/tests/full-flow.test.js`);
  console.log("");
  console.log("  Afterwards the suite prints DELETE statements for every booking,");
  console.log("  contact message and diagnosis request it created; those rows stay in");
  console.log("  the database, and the bookings keep blocking their slots, until the");
  console.log("  printed SQL is run.");
  console.log("");
  console.log(`  To run locally instead, start the backend and leave API_BASE unset`);
  console.log(`  (the default target is ${DEFAULT_API}).`);
  console.log("");
  return false;
}

/* ================================================================== */

async function main() {
  if (!confirmTarget()) {
    process.exitCode = 1;
    return;
  }

  console.log(C.bold + "AutoSense end-to-end API test" + C.reset);
  console.log(`  API:      ${API}`);
  console.log(`  Frontend: ${FRONTEND}`);
  console.log(`  Shop date (${SHOP_TZ}): ${shopTodayKey()}`);
  console.log(`  Started:  ${new Date().toISOString()}`);

  const groups = [
    group1, group2, group3, group4, group5, group6, group7,
    group8, group9, group10, group11, group12, group13,
  ];
  for (const g of groups) {
    try {
      await g();
    } catch (e) {
      // A failing group must never take the whole run down.
      fail(`${g.name} crashed`, e.message);
    }
  }

  const failed = report();
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(C.red + "Fatal: " + e.stack + C.reset);
  process.exitCode = 1;
});
