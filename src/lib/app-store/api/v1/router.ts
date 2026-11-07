/**
 * LinkBooks Public API v1 — versioned surface for authorized third-party developers.
 * Partners never receive service-role or unrestricted database access.
 * Runtime HTTP mounting continues after OAuth token issuance is production-ready.
 */

import { PUBLIC_API_SCOPES, PUBLIC_API_VERSION } from "@/lib/app-store/public-api-scopes";

export type PublicApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "conflict"
  | "not_implemented";

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
