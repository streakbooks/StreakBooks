import { readFileSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_ROUTES, matchRoute } from "./contracts";
import { statusForMessage, statusForSqlState } from "./errors";
import { buildOpenApiDocument } from "./openapi";

type RpcCall = { fn: string; args: Record<string, unknown> | undefined };
const calls: RpcCall[] = [];
let userRpc: (fn: string, args?: Record<string, unknown>) => unknown = () => ({});
let adminRpc: (fn: string, args?: Record<string, unknown>) => unknown = () => ({});
let anonRpc: (fn: string, args?: Record<string, unknown>) => unknown = () => ({});

function client(handler: () => (fn: string, args?: Record<string, unknown>) => unknown) {
  return {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      try {
        return { data: await handler()(fn, args), error: null };
      } catch (error) {
        const failure = error as { code?: string; message: string };
        return { data: null, error: { code: failure.code, message: failure.message } };
      }
    },
  };
}

vi.mock("./supabase.server", () => ({
  userClient: () => ({
    ...client(() => userRpc),
    auth: {
      getClaims: async (token: string) =>
        token === "header.valid.signature"
          ? { data: { claims: { sub: "00000000-0000-0000-0000-0000000000aa", aal: "aal1" } } }
          : { data: null, error: { message: "bad" } },
    },
  }),
  anonymousClient: () => client(() => anonRpc),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: client(() => adminRpc),
}));

const { handleApiV1, registeredHandlers } = await import("./router.server");

const COMPANY = "10000000-0000-0000-0000-00000000000a";
const bearer = { authorization: "Bearer header.valid.signature" };

function call(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return handleApiV1(
    new Request(`https://app.example.test${path}`, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
  userRpc = () => ({});
  adminRpc = () => ({});
  anonRpc = () => ({});
});

describe("contracts", () => {
  it("has a handler for every route except signed webhooks", () => {
    const handled = new Set(registeredHandlers());
    for (const route of API_ROUTES) {
      if (route.auth !== "signature") expect(handled.has(route.id), route.id).toBe(true);
    }
    expect(new Set(API_ROUTES.map((route) => route.id)).size).toBe(API_ROUTES.length);
  });

  it("matches path parameters and reports allowed methods", () => {
    const id = "20000000-0000-0000-0000-000000000001";
    const found = matchRoute("GET", `/api/v1/invoices/${id}/pdf`);
    expect(found && "route" in found && found.route.id).toBe("invoicePdf");
    expect(found && "params" in found && found.params["id"]).toBe(id);
    expect(matchRoute("DELETE", "/api/v1/invoices")).toEqual({ allowed: ["GET"] });
    expect(matchRoute("GET", "/api/v1/nothing")).toBeNull();
  });

  it("requires a scope on every admin route", () => {
    for (const route of API_ROUTES.filter((item) => item.auth === "platform")) {
      expect(route.scope, route.id).toBeTruthy();
      expect(route.path.startsWith("/api/v1/admin/")).toBe(true);
    }
  });

  it("keeps the committed OpenAPI document current", () => {
    const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
    const file = new URL("../../../../../docs/billing/openapi.json", import.meta.url);
    if (process.env["UPDATE_OPENAPI"] === "1") writeFileSync(file, generated);
    expect(readFileSync(file, "utf8")).toBe(generated);
  });
});

describe("errors", () => {
  it("maps database states and messages", () => {
    expect(statusForSqlState("42501").status).toBe(403);
    expect(statusForSqlState("P0001").status).toBe(422);
    expect(statusForSqlState("23505").status).toBe(409);
    expect(statusForSqlState("XX000").status).toBe(500);
    expect(statusForMessage("You do not have permission to manage billing").status).toBe(403);
    expect(statusForMessage("Choose a plan.").status).toBe(422);
  });
});

describe("router", () => {
  it("serves the OpenAPI document", async () => {
    const response = await call("GET", "/api/v1/openapi.json");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { openapi: string }).openapi).toBe("3.1.0");
  });

  it("answers public pricing with the envelope", async () => {
    anonRpc = (fn) => (fn === "billing_price_list" ? { country: "IN", currency: "INR" } : null);
    const response = await call("GET", "/api/v1/pricing/price-list?country=IN");
    const body = (await response.json()) as {
      data: unknown;
      error: unknown;
      meta: { requestId: string };
    };
    expect(response.status).toBe(200);
    expect(body.data).toEqual({ country: "IN", currency: "INR" });
    expect(body.error).toBeNull();
    expect(response.headers.get("x-request-id")).toBe(body.meta.requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unknown routes, wrong methods and invalid input", async () => {
    expect((await call("GET", "/api/v1/nowhere")).status).toBe(404);
    const wrong = await call("DELETE", "/api/v1/invoices");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET");
    const invalid = await call("GET", "/api/v1/pricing/price-list?country=india");
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe(
      "validation_error",
    );
    const extra = await call("GET", `/api/v1/invoices?companyId=${COMPANY}&admin=1`, {
      headers: bearer,
    });
    expect(extra.status).toBe(400);
  });

  it("requires a valid bearer token for customer routes", async () => {
    expect((await call("GET", `/api/v1/invoices?companyId=${COMPANY}`)).status).toBe(401);
    const bad = await call("GET", `/api/v1/invoices?companyId=${COMPANY}`, {
      headers: { authorization: "Bearer not.a.valid-token" },
    });
    expect(bad.status).toBe(401);
    const key = await call("GET", `/api/v1/invoices?companyId=${COMPANY}`, {
      headers: { "x-api-key": "k".repeat(64) },
    });
    expect(key.status).toBe(401);
    expect(calls.some((c) => c.fn === "billing_documents")).toBe(false);
  });

  it("passes the caller's own client to the database and maps its refusals", async () => {
    userRpc = () => {
      throw Object.assign(new Error("You do not have permission"), { code: "42501" });
    };
    const response = await call("GET", `/api/v1/invoices?companyId=${COMPANY}`, {
      headers: bearer,
    });
    expect(response.status).toBe(403);
    expect(calls).toEqual([{ fn: "billing_documents", args: { _company_id: COMPANY } }]);
  });

  it("hides unexpected database errors", async () => {
    userRpc = () => {
      throw Object.assign(new Error("relation secret_table does not exist"), { code: "42P01" });
    };
    const response = await call("GET", `/api/v1/subscriptions/current?companyId=${COMPANY}`, {
      headers: bearer,
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret_table");
  });

  it("checks API key scopes for admin routes", async () => {
    adminRpc = (fn) =>
      fn === "billing_api_key_authenticate" ? { keyId: "k1", scopes: ["billing:analytics"] } : null;
    const denied = await call("GET", "/api/v1/admin/billing/invoices", {
      headers: { "x-api-key": "raw-key" },
    });
    expect(denied.status).toBe(403);
    adminRpc = (fn) =>
      fn === "billing_api_key_authenticate"
        ? { keyId: "k1", scopes: ["billing:read"] }
        : { items: [], nextCursor: null };
    const allowed = await call("GET", "/api/v1/admin/billing/invoices?limit=10", {
      headers: { "x-api-key": "raw-key" },
    });
    expect(allowed.status).toBe(200);
    const read = calls.find((c) => c.fn === "billing_api_invoices");
    expect(read?.args).toMatchObject({ _limit: 10, _after: null });
    const hashed = calls.find((c) => c.fn === "billing_api_key_authenticate");
    expect(hashed?.args?.["_key_hash"]).toMatch(/^[0-9a-f]{64}$/);
    adminRpc = () => null;
    const unknown = await call("GET", "/api/v1/admin/billing/payments", {
      headers: { "x-api-key": "wrong" },
    });
    expect(unknown.status).toBe(401);
  });

  it("serves analytics to keys with billing:analytics and to staff through their own check", async () => {
    adminRpc = (fn) =>
      fn === "billing_api_key_authenticate"
        ? { keyId: "k2", scopes: ["billing:analytics"] }
        : { mrr: [], range: { from: "a", to: "b" } };
    const keyed = await call("GET", "/api/v1/admin/billing/analytics", {
      headers: { "x-api-key": "raw-key" },
    });
    expect(keyed.status).toBe(200);
    expect(calls.some((c) => c.fn === "billing_api_analytics")).toBe(true);
    calls.length = 0;
    userRpc = () => ({ mrr: [] });
    const staff = await call(
      "GET",
      "/api/v1/admin/billing/analytics?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z",
      { headers: bearer },
    );
    expect(staff.status).toBe(200);
    expect(calls.map((c) => c.fn)).toEqual([
      "platform_billing_api_access",
      "platform_billing_analytics",
    ]);
  });

  it("requires the platform check for staff using their own token", async () => {
    userRpc = (fn) => {
      if (fn === "platform_billing_api_access") {
        throw Object.assign(new Error("Platform permission required"), { code: "42501" });
      }
      return null;
    };
    const response = await call("GET", "/api/v1/admin/billing/subscriptions", { headers: bearer });
    expect(response.status).toBe(403);
    expect(calls.some((c) => c.fn === "billing_api_subscriptions")).toBe(false);
  });

  it("replays idempotent requests and refuses reused keys", async () => {
    const stored = { data: { ok: true }, error: null, meta: { requestId: "first" } };
    adminRpc = (fn) =>
      fn === "billing_api_idempotency_begin"
        ? { state: "replay", status: 200, response: stored }
        : null;
    const body = { accountId: COMPANY, scheme: "GSTIN", taxId: "27AAAPL1234C1ZV" };
    const replay = await call("PUT", "/api/v1/billing/tax-id", {
      headers: { ...bearer, "idempotency-key": "tax-id-0001" },
      body,
    });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(await replay.json()).toEqual(stored);
    expect(calls.some((c) => c.fn === "billing_set_tax_id")).toBe(false);

    adminRpc = (fn) => (fn === "billing_api_idempotency_begin" ? { state: "conflict" } : null);
    const conflict = await call("PUT", "/api/v1/billing/tax-id", {
      headers: { ...bearer, "idempotency-key": "tax-id-0001" },
      body,
    });
    expect(conflict.status).toBe(409);

    calls.length = 0;
    adminRpc = (fn) => (fn === "billing_api_idempotency_begin" ? { state: "new" } : null);
    const fresh = await call("PUT", "/api/v1/billing/tax-id", {
      headers: { ...bearer, "idempotency-key": "tax-id-0002" },
      body,
    });
    expect(fresh.status).toBe(200);
    expect(calls.map((c) => c.fn)).toEqual([
      "billing_api_idempotency_begin",
      "billing_set_tax_id",
      "billing_api_idempotency_finish",
    ]);
    expect(calls[2]?.args).toMatchObject({
      _status: 200,
      _actor: "user:00000000-0000-0000-0000-0000000000aa",
    });
  });

  it("rejects malformed bodies", async () => {
    const response = await handleApiV1(
      new Request("https://app.example.test/api/v1/billing/tax-id", {
        method: "PUT",
        headers: { ...bearer, "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(response.status).toBe(400);
    const missing = await call("POST", "/api/v1/subscriptions/cancel", {
      headers: bearer,
      body: { companyId: COMPANY, confirm: false },
    });
    expect(missing.status).toBe(400);
  });
});
