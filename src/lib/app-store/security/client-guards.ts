/**
 * Client/bundle guards — never ship service-role material to the browser.
 */

const FORBIDDEN_ENV_PREFIXES = ["SERVICE_ROLE", "SUPABASE_SERVICE"] as const;

export function assertNoServiceRoleEnvLeak(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)
    : {},
): { ok: true } | { ok: false; keys: string[] } {
  const leaked = Object.keys(env).filter((key) => {
    const upper = key.toUpperCase();
    if (upper.startsWith("VITE_") && FORBIDDEN_ENV_PREFIXES.some((p) => upper.includes(p))) {
      return true;
    }
    return false;
  });
  if (leaked.length > 0) return { ok: false, keys: leaked };
  return { ok: true };
}

export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "access_token",
    "refresh_token",
    "secret",
    "clientSecret",
    "client_secret",
    "authorization",
    "account_number",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (blocked.has(key) || blocked.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}
