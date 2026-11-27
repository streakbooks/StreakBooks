/**
 * Load `.env` then `.env.local` (local overrides). Explicit non-empty process.env wins.
 * Never logs secret values.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvFiles(cwd = process.cwd()) {
  const fromFiles = {
    ...parseEnvFile(resolve(cwd, ".env")),
    ...parseEnvFile(resolve(cwd, ".env.local")),
  };
  const env = { ...fromFiles };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== "") env[key] = value;
  }
  return env;
}

/** Report whether a key is set without revealing the value. */
export function envPresence(env, key) {
  const value = env[key] ?? "";
  if (!value) return "missing";
  if (key === "RAZORPAY_KEY_ID") {
    if (value.startsWith("rzp_test_")) return "present(test_prefix)";
    if (value.startsWith("rzp_live_")) return "present(LIVE_PREFIX)";
    return "present(unknown_prefix)";
  }
  if (key === "RAZORPAY_MODE") return `present(${value})`;
  if (key === "STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS") {
    return value === "true" ? "present(true)" : "present(not_true)";
  }
  return `present(len=${value.length})`;
}
