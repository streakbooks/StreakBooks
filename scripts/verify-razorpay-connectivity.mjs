#!/usr/bin/env node
/**
 * Phase 1 — Razorpay Test Mode connectivity (no subscriptions, no secret printing).
 *
 *   node scripts/verify-razorpay-connectivity.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { envPresence, loadEnvFiles } from "./lib/load-env.mjs";

const env = loadEnvFiles();
const required = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_MODE",
];

console.log("=== Razorpay env presence (values never printed) ===");
for (const key of required) {
  console.log(`${key}: ${envPresence(env, key)}`);
}
console.log(
  `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS: ${envPresence(env, "STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS")}`,
);
console.log(`STRIPE_SECRET_KEY: ${envPresence(env, "STRIPE_SECRET_KEY")} (unchanged check)`);

const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");
const envIgnored =
  gitignore.split(/\r?\n/).some((line) => line.trim() === ".env") ||
  gitignore.split(/\r?\n/).some((line) => line.trim() === ".env.*");
const localIgnored =
  envIgnored || gitignore.split(/\r?\n/).some((line) => line.trim() === ".env.local");
console.log(`gitignore covers .env / .env.*: ${envIgnored ? "yes" : "NO"}`);
console.log(`.env.local ignored: ${localIgnored ? "yes" : "NO"}`);
console.log(`.env.local exists: ${existsSync(resolve(process.cwd(), ".env.local")) ? "yes" : "no"}`);

const keyId = env.RAZORPAY_KEY_ID ?? "";
const secret = env.RAZORPAY_KEY_SECRET ?? "";
const mode = (env.RAZORPAY_MODE ?? "").trim().toLowerCase();
const allowLive = env.STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS === "true";

let failed = false;
function fail(message) {
  failed = true;
  console.error(`FAIL: ${message}`);
}

if (!keyId || !secret) {
  fail("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env.local (do not paste into chat).");
}
if (mode !== "test") {
  fail('RAZORPAY_MODE must be "test" for this verification (live payments are disabled).');
}
if (keyId && !keyId.startsWith("rzp_test_")) {
  fail("RAZORPAY_KEY_ID must start with rzp_test_ while RAZORPAY_MODE=test.");
}
if (allowLive) {
  fail("STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS must not be true during Test Mode verification.");
}
const webhookMissing = !(env.RAZORPAY_WEBHOOK_SECRET ?? "");
if (webhookMissing) {
  console.warn(
    "WARN: RAZORPAY_WEBHOOK_SECRET missing — API auth can still be checked; webhooks will fail until set.",
  );
}

if (failed) {
  console.error("\nConnectivity skipped until local Test Mode API credentials are present.");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
console.log("\n=== Razorpay API connectivity (GET /v1/plans?count=1) ===");
try {
  const response = await fetch("https://api.razorpay.com/v1/plans?count=1", {
    method: "GET",
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 401 || response.status === 403) {
    fail(`API authentication failed (HTTP ${response.status}). Check Key ID / Secret pair.`);
  } else if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const description =
      body && typeof body === "object" && body.error && typeof body.error.description === "string"
        ? body.error.description
        : `HTTP ${response.status}`;
    fail(`API request failed: ${description}`);
  } else {
    const payload = await response.json();
    const count = Array.isArray(payload?.items) ? payload.items.length : 0;
    console.log(`OK: authenticated against Razorpay Test Mode (sample plans returned: ${count}).`);
    console.log("OK: key id uses rzp_test_ prefix; no subscriptions created.");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (webhookMissing) {
  console.warn("\nAPI connectivity OK, but set RAZORPAY_WEBHOOK_SECRET before subscription E2E.");
  process.exit(2);
}
process.exit(failed ? 1 : 0);
