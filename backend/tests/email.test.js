#!/usr/bin/env node

import { strict as assert } from "node:assert";

const results = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  results.push({ name, fn });
}

async function run() {
  for (const { name, fn } of results) {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL  ${name}`);
      console.log(`        ${error.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let fetchCalls = [];
let fetchImpl = null;
let logOutput = [];

function mockFetch(impl) {
  fetchImpl = impl;
  fetchCalls = [];
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    return fetchImpl(...args);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  fetchCalls = [];
  fetchImpl = null;
}

function setResendEnv() {
  process.env.RESEND_API_KEY = "re_test_fake_key_123";
  process.env.EMAIL_FROM_ADDRESS = "noreply@test.autosense.com";
  process.env.EMAIL_FROM_NAME = "AutoSense Test";
}

function clearEmailEnv() {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM_ADDRESS;
  delete process.env.EMAIL_FROM_NAME;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
}

function captureLog() {
  logOutput = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => {
    logOutput.push(args.join(" "));
  };
  console.error = (...args) => {
    logOutput.push(args.join(" "));
  };
  return () => {
    console.log = origLog;
    console.error = origError;
  };
}

const {
  isEmailConfigured,
  sendBookingConfirmation,
  sendBookingStatusEmail,
} = await import("../src/lib/emailService.js");

const sampleBooking = {
  referenceId: "AS-TEST01",
  fullName: "Jane Doe",
  email: "jane@example.com",
  date: "2026-12-15",
  time: "10:00",
  durationMinutes: 60,
  vehicle: { year: 2024, make: "Toyota", model: "Camry" },
  services: [{ name: "Oil Change" }],
};

test("Resend: request URL is correct", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(async () => ({
    ok: true,
    json: async () => ({ id: "email_123" }),
  }));

  const restore = captureLog();
  try {
    await sendBookingConfirmation(sampleBooking);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0][0], "https://api.resend.com/emails");
  } finally {
    restore();
    restoreFetch();
  }
});

test("Resend: Authorization header is correct", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(async (url, opts) => {
    assert.equal(opts.headers.Authorization, "Bearer re_test_fake_key_123");
    return { ok: true, json: async () => ({ id: "email_123" }) };
  });

  const restore = captureLog();
  try {
    await sendBookingConfirmation(sampleBooking);
  } finally {
    restore();
    restoreFetch();
  }
});

test("Resend: body fields are correct", async () => {
  clearEmailEnv();
  setResendEnv();
  let sentBody = null;
  mockFetch(async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ id: "email_123" }) };
  });

  const restore = captureLog();
  try {
    await sendBookingConfirmation(sampleBooking);
    assert.ok(sentBody);
    assert.equal(sentBody.from, "AutoSense Test <noreply@test.autosense.com>");
    assert.deepEqual(sentBody.to, ["jane@example.com"]);
    assert.ok(sentBody.subject.includes("AS-TEST01"));
    assert.ok(typeof sentBody.html === "string" && sentBody.html.length > 0);
    assert.ok(typeof sentBody.text === "string" && sentBody.text.length > 0);
  } finally {
    restore();
    restoreFetch();
  }
});

test("Resend: 200 returns true", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(async () => ({
    ok: true,
    json: async () => ({ id: "email_123" }),
  }));

  const restore = captureLog();
  try {
    const result = await sendBookingConfirmation(sampleBooking);
    assert.equal(result, true);
  } finally {
    restore();
    restoreFetch();
  }
});

test("Resend: 403 returns false", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: "Forbidden" }),
  }));

  const restore = captureLog();
  try {
    const result = await sendBookingConfirmation(sampleBooking);
    assert.equal(result, false);
  } finally {
    restore();
    restoreFetch();
  }
});

test("Resend: network error returns false", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(async () => {
    throw new TypeError("fetch failed");
  });

  const restore = captureLog();
  try {
    const result = await sendBookingConfirmation(sampleBooking);
    assert.equal(result, false);
  } finally {
    restore();
    restoreFetch();
  }
});

test("Resend: timeout returns false", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(
    async (url, opts) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve({ ok: true, json: async () => ({ id: "x" }) }),
          30_000,
        );
        if (opts.signal) {
          opts.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }
      }),
  );

  const restore = captureLog();
  try {
    const start = Date.now();
    const result = await sendBookingConfirmation(sampleBooking);
    const elapsed = Date.now() - start;
    assert.equal(result, false);
    assert.ok(elapsed < 15_000, `Took ${elapsed}ms, expected under 15s`);
  } finally {
    restore();
    restoreFetch();
  }
});

test("No RESEND_API_KEY: returns false without calling fetch", async () => {
  clearEmailEnv();
  process.env.EMAIL_FROM_ADDRESS = "noreply@test.autosense.com";
  let fetchCalled = false;
  mockFetch(async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ id: "x" }) };
  });

  const restore = captureLog();
  try {
    const result = await sendBookingConfirmation(sampleBooking);
    assert.equal(result, false);
    assert.equal(fetchCalled, false);
  } finally {
    restore();
    restoreFetch();
    delete process.env.EMAIL_FROM_ADDRESS;
  }
});

test("Script tags in customer name are escaped in HTML", async () => {
  clearEmailEnv();
  setResendEnv();
  let sentBody = null;
  mockFetch(async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ id: "email_123" }) };
  });

  const restore = captureLog();
  try {
    await sendBookingConfirmation({
      ...sampleBooking,
      fullName: '<script>alert("xss")</script>',
    });
    assert.ok(sentBody);
    assert.ok(
      !sentBody.html.includes("<script>"),
      "Raw script tag must not appear in HTML",
    );
    assert.ok(
      sentBody.html.includes("&lt;script&gt;"),
      "Script tag must be escaped",
    );
  } finally {
    restore();
    restoreFetch();
  }
});

test("Logged output never contains the API key or recipient email", async () => {
  clearEmailEnv();
  setResendEnv();
  mockFetch(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: "Server error" }),
  }));

  const restore = captureLog();
  try {
    await sendBookingConfirmation(sampleBooking);
    const allOutput = logOutput.join("\n");
    assert.ok(
      !allOutput.includes("re_test_fake_key_123"),
      "Log output must not contain the API key",
    );
    assert.ok(
      !allOutput.includes("jane@example.com"),
      "Log output must not contain the recipient email",
    );
  } finally {
    restore();
    restoreFetch();
  }
});

test("isEmailConfigured returns true when Resend vars are set", () => {
  clearEmailEnv();
  setResendEnv();
  assert.equal(isEmailConfigured(), true);
  clearEmailEnv();
});

test("isEmailConfigured returns false when nothing is set", () => {
  clearEmailEnv();
  assert.equal(isEmailConfigured(), false);
});

test("Real email send (optional, requires TEST_EMAIL_TO)", async () => {
  clearEmailEnv();

  const testTo = originalEnv.TEST_EMAIL_TO;
  const resendKey = originalEnv.RESEND_API_KEY;
  const fromAddr = originalEnv.EMAIL_FROM_ADDRESS;

  if (!testTo || !resendKey || !fromAddr) {
    console.log(
      "        Skipped: set TEST_EMAIL_TO, RESEND_API_KEY and EMAIL_FROM_ADDRESS to run this test",
    );
    return;
  }

  process.env.RESEND_API_KEY = resendKey;
  process.env.EMAIL_FROM_ADDRESS = fromAddr;
  process.env.EMAIL_FROM_NAME = originalEnv.EMAIL_FROM_NAME || "AutoSense Test";

  restoreFetch();

  try {
    const result = await sendBookingConfirmation({
      ...sampleBooking,
      email: testTo,
    });
    console.log(
      `        Real send result: ${result ? "accepted by Resend" : "rejected by Resend"}`,
    );
  } finally {
    clearEmailEnv();
  }
});

console.log("\nEmail service tests\n");
run();
