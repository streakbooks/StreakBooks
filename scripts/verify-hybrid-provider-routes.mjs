#!/usr/bin/env node
/**
 * Read-only check: billing_price_list.providers by country against hybrid policy.
 * Uses publishable key only (no mutations, no secrets printed).
 *
 *   node scripts/verify-hybrid-provider-routes.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/load-env.mjs";

const env = loadEnvFiles();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / publishable key");
  process.exit(1);
}

const expected = {
  IN: ["razorpay"],
  GB: ["stripe"],
  US: ["stripe"],
  AU: ["stripe"],
  CA: ["stripe"],
  NZ: ["stripe"],
  IE: ["stripe"],
  DE: ["stripe"],
};

const sb = createClient(url, key, { auth: { persistSession: false } });
let failed = false;
console.log(`Host: ${new URL(url).host}`);
console.log("Country | providers (live) | expected | billingEnabled | match");

for (const [country, want] of Object.entries(expected)) {
  const { data, error } = await sb.rpc("billing_price_list", { _country: country });
  if (error) {
    failed = true;
    console.log(`${country} | ERROR ${error.message}`);
    continue;
  }
  const got = Array.isArray(data?.providers) ? data.providers : [];
  const ok = got.length === want.length && want.every((p, i) => got[i] === p);
  if (!ok) failed = true;
  // India must never list stripe.
  if (country === "IN" && got.includes("stripe")) {
    failed = true;
    console.log(`${country} | FAIL stripe present for India: ${JSON.stringify(got)}`);
    continue;
  }
  console.log(
    `${country} | ${JSON.stringify(got)} | ${JSON.stringify(want)} | ${data?.billingEnabled} | ${ok ? "OK" : "MISMATCH"}`,
  );
}

process.exit(failed ? 1 : 0);
