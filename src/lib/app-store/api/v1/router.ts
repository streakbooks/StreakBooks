/**
 * LinkBooks Public API v1 — versioned surface for authorized third-party developers.
 * Partners never receive service-role or unrestricted database access.
 * Runtime HTTP mounting continues after OAuth token issuance is production-ready.
 * FAIL CLOSED: production data routes stay gated until OAuth vault + security review.
 */

import { PUBLIC_API_SCOPES, PUBLIC_API_VERSION } from "@/lib/app-store/public-api-scopes";
import { evaluateRateLimit } from "@/lib/app-store/security/rate-limit";
import { detectDangerousScopeEscalation } from "@/lib/app-store/security/tenant-isolation";

export type PublicApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "conflict"
  | "not_implemented"
  | "security_locked";

export type PublicApiResponse<T> =
  | { ok: true; data: T; apiVersion: typeof PUBLIC_API_VERSION }
  | {
      ok: false;
      error: { code: PublicApiErrorCode; message: string };
      apiVersion: typeof PUBLIC_API_VERSION;
    };

export type PublicApiRoute = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scope: string;
  summary: string;
  status: "documented" | "implemented" | "gated";
};

/** Catalogue of v1 routes. Gated until OAuth clients can be issued securely. */
export const PUBLIC_API_V1_ROUTES: readonly PublicApiRoute[] = [
  {
    method: "GET",
    path: "/api/v1/organisation",
    scope: "organisation.read",
    summary: "Read organisation profile",
    status: "documented",
  },
  {
    method: "GET",
    path: "/api/v1/contacts",
    scope: "contacts.read",
    summary: "List contacts",
    status: "documented",
  },
  {
    method: "POST",
    path: "/api/v1/contacts",
    scope: "contacts.write",
    summary: "Create or update a contact",
    status: "documented",
  },
  {
    method: "GET",
    path: "/api/v1/products",
    scope: "products.read",
    summary: "List products and services",
    status: "documented",
  },
  {
    method: "POST",
    path: "/api/v1/products",
    scope: "products.write",
    summary: "Create or update a product",
    status: "documented",
  },
  {
    method: "GET",
    path: "/api/v1/sales/invoices",
    scope: "sales.read",
    summary: "List sales invoices",
    status: "documented",
  },
  {
    method: "POST",
    path: "/api/v1/sales/invoices",
    scope: "sales.write",
    summary: "Create a draft sales invoice via accounting-safe paths",
    status: "documented",
  },
  {
    method: "GET",
    path: "/api/v1/purchases/bills",
    scope: "purchases.read",
    summary: "List bills",
    status: "documented",
  },
  {
    method: "POST",
    path: "/api/v1/purchases/bills",
    scope: "purchases.write",
    summary: "Create a draft bill via accounting-safe paths",
    status: "documented",
  },
  {
    method: "GET",
    path: "/api/v1/banking/accounts",
    scope: "banking.read",
    summary: "List bank accounts",
    status: "documented",
  },
  {
    method: "GET",
    path: "/api/v1/accounting/accounts",
    scope: "accounting.read",
    summary: "List chart of accounts",
    status: "documented",
  },
  {
    method: "POST",
    path: "/api/v1/files",
    scope: "files.write",
    summary: "Upload an attachment",
    status: "documented",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/subscriptions",
    scope: "webhooks.manage",
    summary: "Register a webhook subscription",
    status: "documented",
  },
] as const;

export function listPublicApiCatalog() {
  return {
    apiVersion: PUBLIC_API_VERSION,
    scopes: PUBLIC_API_SCOPES,
    routes: PUBLIC_API_V1_ROUTES,
    auth: {
      type: "oauth2",
      pkce: true,
      tokenStorage: "server_vault_hash_only",
      note: "Token issuance is gated until the credential vault is configured.",
    },
  };
}

export function requireScope(
  granted: readonly string[],
  required: string,
): PublicApiResponse<null> {
  if (!granted.includes(required)) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: {
        code: "forbidden",
        message: `Missing required scope: ${required}`,
      },
    };
  }
  return { ok: true, apiVersion: PUBLIC_API_VERSION, data: null };
}

export function notImplemented(feature: string): PublicApiResponse<never> {
  return {
    ok: false,
    apiVersion: PUBLIC_API_VERSION,
    error: {
      code: "not_implemented",
      message: `${feature} is documented but not yet available for production partner calls.`,
    },
  };
}

/** Production partner calls remain locked until vault + security review + consent. */
export function assertPublicApiProductionReady(input: {
  oauthVaultConfigured: boolean;
  securityReviewPassed: boolean;
  consentActive: boolean;
  tokenRevoked: boolean;
}): PublicApiResponse<null> {
  if (input.tokenRevoked) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: { code: "unauthorized", message: "Access token has been revoked." },
    };
  }
  if (!input.oauthVaultConfigured || !input.securityReviewPassed || !input.consentActive) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: {
        code: "security_locked",
        message:
          "FAIL CLOSED: public API production access is locked until OAuth vault, security review and active consent are verified.",
      },
    };
  }
  return { ok: true, apiVersion: PUBLIC_API_VERSION, data: null };
}

export function rejectScopeEscalation(
  requested: readonly string[],
  granted: readonly string[],
): PublicApiResponse<null> {
  const escalated = detectDangerousScopeEscalation(requested, granted);
  if (escalated.length > 0) {
    return {
      ok: false,
      apiVersion: PUBLIC_API_VERSION,
      error: {
        code: "forbidden",
        message: `Scope escalation denied: ${escalated.join(", ")}`,
      },
    };
  }
  return { ok: true, apiVersion: PUBLIC_API_VERSION, data: null };
}

export function checkPublicApiRateLimit(input: {
  nowMs: number;
  priorTimestamps: readonly number[];
  max?: number;
  windowMs?: number;
}): PublicApiResponse<{ remaining: number }> {
  const decision = evaluateRateLimit({
    nowMs: input.nowMs,
    priorTimestamps: input.priorTimestamps,
    max: input.max ?? 60,
    windowMs: input.windowMs ?? 60_000,
  });
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
  return {
    ok: true,
    apiVersion: PUBLIC_API_VERSION,
    data: { remaining: decision.remaining },
  };
}
