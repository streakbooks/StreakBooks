#!/usr/bin/env node
/**
 * Phase 2 — Idempotent Razorpay Test Mode plan mapping for India INR prices.
 *
 * Creates missing Razorpay plans for STANDARD / PRO / BUSINESS × month / year and
 * stores provider_price_id in billing.provider_price_mappings via service_role RPCs.
 * Re-runs never create duplicates when a mapping already exists.
 *
 *   node scripts/setup-razorpay-test-plans.mjs
 *   node scripts/setup-razorpay-test-plans.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { envPresence, loadEnvFiles } from "./lib/load-env.mjs";

const dryRun = process.argv.includes("--dry-run");
const env = loadEnvFiles();
const keyId = env.RAZORPAY_KEY_ID ?? "";
const secret = env.RAZORPAY_KEY_SECRET ?? "";
const mode = (env.RAZORPAY_MODE ?? "").trim().toLowerCase();
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

console.log("=== Preconditions (values never printed) ===");
console.log(`RAZORPAY_KEY_ID: ${envPresence(env, "RAZORPAY_KEY_ID")}`);
console.log(`RAZORPAY_KEY_SECRET: ${envPresence(env, "RAZORPAY_KEY_SECRET")}`);
console.log(`RAZORPAY_MODE: ${envPresence(env, "RAZORPAY_MODE")}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${envPresence(env, "SUPABASE_SERVICE_ROLE_KEY")}`);
console.log(`dryRun: ${dryRun}`);

if (mode !== "test" || !keyId.startsWith("rzp_test_") || !secret) {
  console.error("Requires RAZORPAY_MODE=test and rzp_test_ credentials in .env.local.");
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error("Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function razorpay(method, path, body) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const description =
      payload?.error?.description ?? `Razorpay ${method} ${path} failed (${response.status})`;
    throw new Error(description);
  }
  return payload;
}

const { data: priceList, error: listError } = await sb.rpc("billing_price_list", {
  _country: "IN",
});
if (listError) {
  console.error("billing_price_list failed:", listError.message);
  process.exit(1);
}
if (!Array.isArray(priceList?.providers) || !priceList.providers.includes("razorpay")) {
  console.error("India providers must include razorpay. Got:", priceList?.providers);
  process.exit(1);
}

const targets = ["standard", "pro", "business"];
const rows = [];
for (const plan of priceList.plans ?? []) {
  if (!targets.includes(String(plan.code).toLowerCase())) continue;
  for (const price of plan.prices ?? []) {
    if (String(price.currency).toUpperCase() !== "INR") continue;
    if (price.interval !== "month" && price.interval !== "year") continue;
    rows.push({
      planCode: String(plan.code).toLowerCase(),
      planName: plan.name ?? plan.code,
      planPriceId: price.priceId,
      interval: price.interval,
      amountMinor: price.amountMinor,
      currency: "INR",
    });
  }
}

if (rows.length !== 6) {
  console.error(`Expected 6 INR plan rows (3×2); found ${rows.length}.`);
  process.exit(1);
}

console.log("\n=== Razorpay plan mappings (test mode) ===");
let created = 0;
let reused = 0;
let failed = false;

for (const row of rows) {
  const label = `${row.planCode}/${row.interval} ${row.amountMinor} ${row.currency}`;
  const existing = await sb.rpc("billing_provider_price", {
    _plan_price_id: row.planPriceId,
    _provider: "razorpay",
    _mode: "test",
  });
  if (existing.error) {
    failed = true;
    console.error(`${label}: lookup failed — ${existing.error.message}`);
    continue;
  }
  const mappedId = existing.data?.providerPriceId;
  if (typeof mappedId === "string" && mappedId) {
    reused += 1;
    console.log(`${label}: mapped ${mappedId} (reuse)`);
    continue;
  }

  if (dryRun) {
    console.log(`${label}: would create Razorpay plan (dry-run)`);
    continue;
  }

  try {
    const plan = await razorpay("POST", "plans", {
      period: row.interval === "year" ? "yearly" : "monthly",
      interval: 1,
      item: {
        name: `StreakBooks ${row.planName}`,
        amount: row.amountMinor,
        currency: row.currency,
      },
      notes: {
        plan_price_id: row.planPriceId,
        plan_code: row.planCode,
        billing_interval: row.interval,
      },
    });
    const providerPriceId = typeof plan.id === "string" ? plan.id : "";
    if (!providerPriceId) throw new Error("Razorpay did not return a plan id.");

    const recorded = await sb.rpc("billing_record_provider_price", {
      _plan_price_id: row.planPriceId,
      _provider: "razorpay",
      _mode: "test",
      _provider_product_id: null,
      _provider_price_id: providerPriceId,
    });
    if (recorded.error) throw new Error(recorded.error.message);
    const stored = recorded.data?.providerPriceId ?? providerPriceId;
    created += 1;
    console.log(`${label}: created ${stored}`);
  } catch (error) {
    failed = true;
    console.error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nSummary: reused=${reused} created=${created} dryRun=${dryRun}`);
process.exit(failed ? 1 : 0);
