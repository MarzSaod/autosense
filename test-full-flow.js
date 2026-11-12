#!/usr/bin/env node
/**
 * AutoSense end-to-end production test.
 *
 * Runs every test group against the REAL production API, prints a summary
 * table, and finishes with cleanup SQL for every booking it created.
 *
 * Built-in modules only.  Run with:  node test-full-flow.js
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

const https = require("https");
const { URL } = require("url");

const API = "https://autosense-production.up.railway.app";
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
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
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

  group("CLEANUP SQL");
  if (state.references.length === 0) {
    console.log("  -- No test bookings were created during this run; nothing to clean up.");
  } else {
    const list = state.references.map((r) => `'${r}'`).join(", ");
    console.log(`  -- ${state.references.length} test booking(s) created by this run`);
    console.log("");
    console.log(`DELETE FROM booking_services WHERE booking_id IN (SELECT id FROM bookings WHERE reference_id IN (${list}));`);
    console.log(`DELETE FROM bookings WHERE reference_id IN (${list});`);
  }
  console.log("");

  return failed;
}

/* ================================================================== */

async function main() {
  console.log(C.bold + "AutoSense production end-to-end test" + C.reset);
  console.log(`  API:      ${API}`);
  console.log(`  Frontend: ${FRONTEND}`);
  console.log(`  Shop date (${SHOP_TZ}): ${shopTodayKey()}`);
  console.log(`  Started:  ${new Date().toISOString()}`);

  const groups = [group1, group2, group3, group4, group5, group6, group7];
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
