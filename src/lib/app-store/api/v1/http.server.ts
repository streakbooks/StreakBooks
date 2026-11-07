/**
 * Marketplace public API HTTP entry — mounted at /api/marketplace/v1/*
 * Keeps billing /api/v1/* untouched. Production data routes stay fail-closed.
 */

import {
  PUBLIC_API_V1_ROUTES,
  assertPublicApiProductionReady,
  checkPublicApiRateLimit,
  matchPublicApiRoute,
  type PublicApiResponse,
} from "@/lib/app-store/api/v1/router";
import { PUBLIC_API_VERSION } from "@/lib/app-store/public-api-scopes";
import { buildMarketplaceAbuseAlert } from "@/lib/app-store/security/abuse-alert";
import {
  issueBotChallenge,
  validateBotChallenge,
  type BotChallenge,
} from "@/lib/app-store/security/bot-challenge";
import { evaluateRateLimit } from "@/lib/app-store/security/rate-limit";

const BASE = "/api/marketplace/v1";

/** In-process rate buckets (authoritative Postgres rate limit remains for RPC paths). */
const rateBuckets = new Map<string, number[]>();

/** Short-lived bot challenges issued by GET /challenge. */
const botChallenges = new Map<string, BotChallenge>();

export function __resetMarketplaceHttpTestState(): void {
  rateBuckets.clear();
  botChallenges.clear();
}

function json(status: number, body: unknown, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function statusFor(code: string): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "validation_error":
      return 400;
    case "rate_limited":
      return 429;
    case "security_locked":
      return 503;
    case "not_implemented":
      return 501;
    default:
      return 400;
  }
}

export function marketplaceVaultConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env["MARKETPLACE_OAUTH_VAULT_KEY"]?.trim() ||
      env["APP_STORE_OAUTH_VAULT_CONFIGURED"] === "true",
  );
}

/** Map marketplace URL path to documented /api/v1/... catalogue path. */
export function toMarketplaceCataloguePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === BASE) return "/api/v1";
  const rest = normalized.slice(BASE.length);
  return `/api/v1${rest.startsWith("/") ? rest : `/${rest}`}`;
}

function clientBucketKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fingerprint = request.headers.get("x-marketplace-fingerprint")?.trim();
  return `${forwarded || "unknown"}:${fingerprint || "anon"}`.slice(0, 200);
}

function applyInProcessRateLimit(
  request: Request,
  nowMs: number,
): PublicApiResponse<{ remaining: number }> {
  const key = clientBucketKey(request);
  const prior = rateBuckets.get(key) ?? [];
  const decision = evaluateRateLimit({
    nowMs,
    priorTimestamps: prior,
    max: 60,
    windowMs: 60_000,
  });
  rateBuckets.set(key, decision.nextTimestamps);

  if (!decision.allowed) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: {
        code: "rate_limited",
        message: `Too many API requests. Retry after ${Math.ceil(decision.retryAfterMs / 1000)}s.`,
      },
    };
  }

  return checkPublicApiRateLimit({
    nowMs,
    priorTimestamps: decision.nextTimestamps.slice(0, -1),
    max: 60,
    windowMs: 60_000,
  });
}

function requireBotChallengeIfPresent(
  request: Request,
  nowMs: number,
): PublicApiResponse<null> | null {
  const challengeId = request.headers.get("x-marketplace-challenge-id")?.trim();
  if (!challengeId) return null;

  const challenge = botChallenges.get(challengeId);
  if (!challenge) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: { code: "forbidden", message: "Bot challenge not found or expired." },
    };
  }

  const result = validateBotChallenge({
    challenge,
    presentedChallengeId: challengeId,
    honeypotValue: request.headers.get("x-marketplace-honeypot") ?? "",
    nowMs,
    minSolveMs: 400,
  });
  if (!result.ok) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: { code: "forbidden", message: `Bot challenge failed: ${result.reason}` },
    };
  }
  botChallenges.delete(challengeId);
  return { ok: true, apiVersion: PUBLIC_API_VERSION, data: null };
}

export async function handleMarketplaceApiV1(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const nowMs = Date.now();

  if (pathname === `${BASE}/challenge` && request.method === "GET") {
    const challenge = issueBotChallenge({ nowMs, ttlMs: 60_000 });
    botChallenges.set(challenge.challengeId, challenge);
    return json(200, {
      ok: true,
      apiVersion: PUBLIC_API_VERSION,
      data: {
        challengeId: challenge.challengeId,
        issuedAtMs: challenge.issuedAtMs,
        expiresAtMs: challenge.expiresAtMs,
      },
    });
  }

  if (
    pathname === BASE ||
    pathname === `${BASE}/openapi` ||
    pathname === `${BASE}/routes`
  ) {
    return json(200, {
      ok: true,
      apiVersion: PUBLIC_API_VERSION,
      data: {
        base: BASE,
        note: "FAIL CLOSED until OAuth vault, security review and consent. Billing SaaS API remains at /api/v1.",
        routes: PUBLIC_API_V1_ROUTES,
      },
    } satisfies PublicApiResponse<{
      base: string;
      note: string;
      routes: typeof PUBLIC_API_V1_ROUTES;
    }>);
  }

  const rate = applyInProcessRateLimit(request, nowMs);
  if (!rate.ok) {
    const alert = buildMarketplaceAbuseAlert({
      alertType: "rate_limit",
      summary: "Marketplace public API rate limit exceeded",
      signals: { rateLimitHits: 1 },
      details: { path: pathname, method: request.method },
    });
    return json(statusFor(rate.error.code), rate, {
      "x-marketplace-alert-severity": alert.severity,
    });
  }

  const bot = requireBotChallengeIfPresent(request, nowMs);
  if (bot && !bot.ok) {
    return json(statusFor(bot.error.code), bot);
  }

  const cataloguePath = toMarketplaceCataloguePath(pathname);
  const route = matchPublicApiRoute(request.method, cataloguePath);
  if (!route) {
    return json(404, {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: {
        code: "not_found",
        message: `No marketplace route for ${request.method} ${pathname}`,
      },
    } satisfies PublicApiResponse<never>);
  }

  const lock = assertPublicApiProductionReady({
    oauthVaultConfigured: marketplaceVaultConfigured(),
    securityReviewPassed: false,
    consentActive: false,
    tokenRevoked: false,
  });
  if (!lock.ok) {
    return json(statusFor(lock.error.code), lock);
  }

  return json(501, {
    ok: false,
    apiVersion: PUBLIC_API_VERSION,
    error: {
      code: "not_implemented",
      message: `${route.method} ${route.path} is gated for production partner calls.`,
    },
  } satisfies PublicApiResponse<never>);
}
