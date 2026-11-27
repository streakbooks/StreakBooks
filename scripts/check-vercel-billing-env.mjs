#!/usr/bin/env node
/**
 * Checks whether required billing env var *names* exist on the linked Vercel project.
 * Never prints values. Requires: vercel link + `vercel` CLI auth.
 *
 *   node scripts/check-vercel-billing-env.mjs
 */
import { spawnSync } from "node:child_process";

const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_MODE",
  "STREAKBOOKS_CRON_SECRET",
  "CRON_SECRET",
  "APP_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const result = spawnSync("npx", ["vercel", "env", "ls"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "vercel env ls failed");
  process.exit(1);
}
const text = `${result.stdout}\n${result.stderr}`;
const names = new Set(
  text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name)),
);

console.log("=== Vercel billing env name presence (no values) ===");
let missing = 0;
for (const key of required) {
  const ok = names.has(key);
  if (!ok) missing += 1;
  console.log(`${key}: ${ok ? "present" : "MISSING"}`);
}
console.log(
  missing ? `\n${missing} required billing variable(s) missing.` : "\nAll required names present.",
);
process.exit(missing ? 1 : 0);
