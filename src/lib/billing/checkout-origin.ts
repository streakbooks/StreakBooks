/**
 * Allowed checkout / portal return origins.
 * Prefer configured APP_ORIGIN; also accept the host that served this request
 * so staging aliases (e.g. streak-books.vercel.app) work without a redeploy
 * mismatch against a different APP_ORIGIN.
 */
const LOCAL_ORIGINS = [
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function pushOrigin(allowed: Set<string>, value: string | null | undefined) {
  if (!value) return;
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      allowed.add(new URL(withProtocol).origin);
    } catch {
      // Ignore malformed configured origins.
    }
  }
}

export function allowedCheckoutOrigins(input?: {
  requestHost?: string | null;
  requestProto?: string | null;
}): Set<string> {
  const allowed = new Set(LOCAL_ORIGINS);
  for (const key of ["APP_ORIGIN", "SITE_URL", "VITE_SITE_URL", "BILLING_ALLOWED_ORIGINS"] as const) {
    pushOrigin(allowed, process.env[key]);
  }
  pushOrigin(allowed, process.env["VERCEL_URL"]);
  pushOrigin(allowed, process.env["VERCEL_BRANCH_URL"]);
  pushOrigin(allowed, process.env["VERCEL_PROJECT_PRODUCTION_URL"]);

  const host = (input?.requestHost ?? "").split(",")[0]?.trim();
  if (host && !host.includes("/") && !host.includes(" ")) {
    const proto = (input?.requestProto ?? "https").split(",")[0]?.trim() || "https";
    pushOrigin(allowed, `${proto}://${host}`);
  }
  return allowed;
}

export function assertCheckoutOrigin(
  origin: string,
  request?: { host?: string | null; proto?: string | null },
): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("The return address is not valid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The return address is not valid.");
  }
  if (url.username || url.password) throw new Error("The return address is not valid.");
  const allowed = allowedCheckoutOrigins({
    ...(request?.host !== undefined ? { requestHost: request.host } : {}),
    ...(request?.proto !== undefined ? { requestProto: request.proto } : {}),
  });
  if (!allowed.has(url.origin)) throw new Error("The return address is not allowed.");
  return url.origin;
}
