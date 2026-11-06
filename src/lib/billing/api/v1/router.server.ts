import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { matchRoute, type ApiRoute } from "./contracts";
import { ApiError, errorBody, statusForMessage, statusForSqlState } from "./errors";
import { buildOpenApiDocument } from "./openapi";
import { anonymousClient, userClient, type RpcClient } from "./supabase.server";

type Caller =
  | { kind: "anonymous" }
  | { kind: "user"; userId: string; claims: Record<string, unknown>; client: RpcClient }
  | { kind: "apiKey"; keyId: string; scopes: string[] };

type Handler = (input: {
  caller: Caller;
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: Record<string, unknown>;
  request: Request;
}) => Promise<unknown>;

const MAX_BODY_BYTES = 64 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

class RpcFailure extends Error {
  constructor(
    readonly sqlState: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function rpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new RpcFailure(error.code, error.message);
  return data;
}

async function adminClient(): Promise<RpcClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as RpcClient;
}

function json(status: number, body: unknown, requestId: string, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

function validation(error: z.ZodError, where: string): ApiError {
  return new ApiError(400, "validation_error", `The ${where} is not valid.`, {
    issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

function user(caller: Caller) {
  if (caller.kind !== "user") throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  return caller;
}

async function resolveCaller(request: Request, route: ApiRoute): Promise<Caller> {
  const authorization = request.headers.get("authorization") ?? "";
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    if (route.auth !== "platform") {
      throw new ApiError(401, "unauthenticated", "API keys can only call admin endpoints.");
    }
    const hash = createHash("sha256").update(apiKey.trim(), "utf8").digest("hex");
    const found = (await rpc(await adminClient(), "billing_api_key_authenticate", {
      _key_hash: hash,
    })) as { keyId: string; scopes: string[] } | null;
    if (!found) throw new ApiError(401, "unauthenticated", "The API key is not valid.");
    return { kind: "apiKey", keyId: found.keyId, scopes: found.scopes };
  }
  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token.split(".").length !== 3) {
      throw new ApiError(401, "unauthenticated", "The access token is not valid.");
    }
    const client = userClient(token);
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims as Record<string, unknown> | undefined;
    if (error || typeof claims?.["sub"] !== "string") {
      throw new ApiError(401, "unauthenticated", "The access token is not valid.");
    }
    return {
      kind: "user",
      userId: claims["sub"],
      claims,
      client: client as unknown as RpcClient,
    };
  }
  if (authorization) throw new ApiError(401, "unauthenticated", "Use a Bearer access token.");
  return { kind: "anonymous" };
}

async function authorise(caller: Caller, route: ApiRoute): Promise<void> {
  if (route.auth === "user") {
    user(caller);
  } else if (route.auth === "platform") {
    if (caller.kind === "apiKey") {
      if (!route.scope || !caller.scopes.includes(route.scope)) {
        throw new ApiError(403, "forbidden", `This API key lacks the ${route.scope} scope.`);
      }
    } else {
      await rpc(user(caller).client, "platform_billing_api_access");
    }
  }
}

function documentHandler(kind: "invoice" | "credit_note", pdf: boolean): Handler {
  return async ({ caller, params }) => {
    const { client } = user(caller);
    if (!pdf) return rpc(client, "billing_document", { _kind: kind, _id: params["id"] });
    const { documentDownloadFor } = await import("@/lib/billing/billing-documents.functions");
    return documentDownloadFor({ supabase: client }, { kind, id: params["id"] ?? "" });
  };
}

async function adminRead(fn: string, args: Record<string, unknown>) {
  return rpc(await adminClient(), fn, args);
}

const HANDLERS: Record<string, Handler> = {
  priceList: async ({ caller, query }) =>
    rpc(caller.kind === "user" ? caller.client : anonymousClient(), "billing_price_list", {
      _country: query["country"],
    }),
  legalDocuments: async ({ query }) =>
    rpc(anonymousClient(), "billing_published_legal_documents", {
      _kinds: null,
      _locale: query["locale"] ?? "en",
    }),
  quote: async ({ caller, query }) => {
    const { client } = user(caller);
    return query["coupon"]
      ? rpc(client, "billing_quote_coupon", {
          _company_id: query["companyId"],
          _plan_code: query["planCode"],
          _interval: query["interval"],
          _code: query["coupon"],
        })
      : rpc(client, "billing_checkout_price", {
          _company_id: query["companyId"],
          _plan_code: query["planCode"],
          _interval: query["interval"],
        });
  },
  subscriptionCurrent: async ({ caller, query }) =>
    rpc(user(caller).client, "billing_subscription_state", { _company_id: query["companyId"] }),
  subscriptionTrial: async ({ caller, body }) => {
    const { client } = user(caller);
    const { parseTrialRequest, startTrialFor } = await import("@/lib/billing/billing.functions");
    return startTrialFor(
      { supabase: client as never },
      parseTrialRequest(body as { companyId: string; planCode: string }),
    );
  },
  subscriptionCheckout: async ({ caller, body }) => {
    const { client, userId } = user(caller);
    const { parseCheckoutRequest, createCheckoutFor } =
      await import("@/lib/billing/billing.functions");
    return createCheckoutFor(
      { supabase: client as never, userId },
      parseCheckoutRequest(body as never),
    );
  },
  subscriptionPlanChange: async ({ caller, body }) => {
    const { client, userId } = user(caller);
    const { parsePlanChange, changePlanFor } =
      await import("@/lib/billing/subscription-actions.functions");
    return changePlanFor(
      { supabase: client, userId },
      parsePlanChange(body as { companyId: string; planCode: string }),
    );
  },
  subscriptionCancel: async ({ caller, body, request }) => {
    const { client, userId, claims } = user(caller);
    const { cancelInput, cancelSubscriptionFor } =
      await import("@/lib/billing/subscription-lifecycle.functions");
    return cancelSubscriptionFor(
      { supabase: client, userId, claims },
      cancelInput.parse(body),
      request.headers,
    );
  },
  subscriptionCancelReverse: async ({ caller, body }) => {
    const { client, userId } = user(caller);
    const { companyInput, reverseCancellationFor } =
      await import("@/lib/billing/subscription-lifecycle.functions");
    return reverseCancellationFor({ supabase: client, userId }, companyInput.parse(body));
  },
  billingAccount: async ({ caller, query }) =>
    rpc(user(caller).client, "billing_account_for_company", { _company_id: query["companyId"] }),
  billingTaxId: async ({ caller, body }) => {
    await rpc(user(caller).client, "billing_set_tax_id", {
      _account_id: body["accountId"],
      _scheme: body["scheme"],
      _tax_id: body["taxId"] || null,
    });
    return { ok: true };
  },
  invoiceList: async ({ caller, query }) =>
    rpc(user(caller).client, "billing_documents", { _company_id: query["companyId"] }),
  invoiceGet: documentHandler("invoice", false),
  invoicePdf: documentHandler("invoice", true),
  creditNoteGet: documentHandler("credit_note", false),
  creditNotePdf: documentHandler("credit_note", true),
  referralStatus: async ({ caller, query }) =>
    rpc(user(caller).client, "billing_referral_status", { _company_id: query["companyId"] }),
  referralRecord: async ({ caller, body, request }) => {
    const { clientAddressHash } = await import("@/lib/billing/client-address.server");
    return rpc(user(caller).client, "billing_record_referral", {
      _company_id: body["companyId"],
      _code: body["code"],
      _disclosure_id: body["disclosureId"],
      _ip_hash: await clientAddressHash(request.headers),
    });
  },
  partnerMe: async ({ caller }) => rpc(user(caller).client, "billing_partner_portal"),
  partnerRegister: async ({ caller, body, request }) => {
    const { clientAddressHash } = await import("@/lib/billing/client-address.server");
    return rpc(user(caller).client, "billing_partner_apply", {
      _firm_id: body["firmId"],
      _contact_email: body["contactEmail"],
      _country: body["countryCode"],
      _membership_reference: body["membershipReference"],
      _terms_id: body["termsId"],
      _ip_hash: await clientAddressHash(request.headers),
    });
  },
  partnerCreateCode: async ({ caller, params }) =>
    rpc(user(caller).client, "billing_partner_create_code", { _partner_id: params["partnerId"] }),
  adminInvoices: async ({ query }) =>
    adminRead("billing_api_invoices", {
      _from: query["from"] ?? null,
      _to: query["to"] ?? null,
      _after: query["cursor"] ?? null,
      _limit: query["limit"] ?? null,
    }),
  adminPayments: async ({ query }) =>
    adminRead("billing_api_payments", {
      _from: query["from"] ?? null,
      _to: query["to"] ?? null,
      _after: query["cursor"] ?? null,
      _limit: query["limit"] ?? null,
    }),
  adminAnalytics: async ({ caller, query }) => {
    const args = { _from: query["from"] ?? null, _to: query["to"] ?? null };
    return caller.kind === "user"
      ? rpc(caller.client, "platform_billing_analytics", args)
      : adminRead("billing_api_analytics", args);
  },
  adminSubscriptions: async ({ query }) =>
    adminRead("billing_api_subscriptions", {
      _after: query["cursor"] ?? null,
      _limit: query["limit"] ?? null,
    }),
};

export function registeredHandlers(): string[] {
  return Object.keys(HANDLERS);
}

async function readBody(request: Request, route: ApiRoute): Promise<Record<string, unknown>> {
  if (!route.body) return {};
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ApiError(400, "validation_error", "Send a JSON body.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new ApiError(400, "validation_error", "The request body is too large.");
  }
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "validation_error", "The request body is not valid JSON.");
  }
  const result = route.body.safeParse(parsed);
  if (!result.success) throw validation(result.error, "request body");
  return result.data as Record<string, unknown>;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof z.ZodError) return validation(error, "request");
  if (error instanceof RpcFailure) {
    const mapped = statusForSqlState(error.sqlState);
    return new ApiError(
      mapped.status,
      mapped.code,
      mapped.status === 500 ? "Unexpected error." : error.message,
    );
  }
  if (error instanceof Error) {
    const mapped = statusForMessage(error.message);
    return new ApiError(mapped.status, mapped.code, error.message);
  }
  return new ApiError(500, "internal", "Unexpected error.");
}

/** Entry point for /api/v1/*: validate, authenticate, replay idempotent calls, run, envelope. */
export async function handleApiV1(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const url = new URL(request.url);
  if (url.pathname === "/api/v1/openapi.json" && request.method === "GET") {
    return json(200, buildOpenApiDocument(), requestId);
  }
  let idempotency: { actor: string; key: string } | null = null;
  try {
    const matched = matchRoute(request.method, url.pathname);
    if (!matched) throw new ApiError(404, "not_found", "No such endpoint.");
    if ("allowed" in matched) {
      const error = new ApiError(405, "method_not_allowed", "Method not allowed.");
      return json(405, errorBody(error, requestId), requestId, {
        allow: matched.allowed.join(", "),
      });
    }
    const { route } = matched;
    if (route.auth === "signature") {
      const { handleBillingWebhook } = await import("@/lib/billing/webhooks");
      return handleBillingWebhook(request);
    }
    const params = route.params ? route.params.safeParse(matched.params) : null;
    if (params && !params.success) throw validation(params.error, "path");
    const query = route.query ? route.query.safeParse(Object.fromEntries(url.searchParams)) : null;
    if (query && !query.success) throw validation(query.error, "query");
    const body = await readBody(request, route);
    const caller = await resolveCaller(request, route);
    await authorise(caller, route);

    const key = request.headers.get("idempotency-key");
    if (key && route.idempotent && caller.kind === "user") {
      if (!IDEMPOTENCY_KEY.test(key)) {
        throw new ApiError(400, "validation_error", "The Idempotency-Key header is not valid.");
      }
      const actor = `user:${caller.userId}`;
      const hash = createHash("sha256")
        .update(`${route.id}\n${JSON.stringify(matched.params)}\n${JSON.stringify(body)}`)
        .digest("hex");
      const begun = (await rpc(await adminClient(), "billing_api_idempotency_begin", {
        _actor: actor,
        _key: key,
        _route: route.id,
        _hash: hash,
      })) as { state: string; status?: number; response?: unknown };
      if (begun.state === "conflict") {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "This Idempotency-Key was used for a different request.",
        );
      }
      if (begun.state === "in_progress") {
        throw new ApiError(
          409,
          "idempotency_in_progress",
          "A request with this Idempotency-Key is still running.",
        );
      }
      if (begun.state === "replay") {
        return json(begun.status ?? 200, begun.response, requestId, {
          "idempotent-replayed": "true",
        });
      }
      idempotency = { actor, key };
    }

    const handler = HANDLERS[route.id];
    if (!handler) throw new ApiError(404, "not_found", "No such endpoint.");
    const data = await handler({
      caller,
      query: (query?.data ?? {}) as Record<string, unknown>,
      params: (params?.data ?? {}) as Record<string, string>,
      body,
      request,
    });
    const payload = { data: data ?? null, error: null, meta: { requestId } };
    if (idempotency) await finishIdempotency(idempotency, 200, payload);
    return json(200, payload, requestId);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status === 500) {
      console.error("Billing API error", requestId, error instanceof Error ? error.message : "");
    }
    const payload = errorBody(apiError, requestId);
    if (idempotency) await finishIdempotency(idempotency, apiError.status, payload);
    return json(apiError.status, payload, requestId);
  }
}

async function finishIdempotency(
  idempotency: { actor: string; key: string },
  status: number,
  payload: unknown,
) {
  await rpc(await adminClient(), "billing_api_idempotency_finish", {
    _actor: idempotency.actor,
    _key: idempotency.key,
    _status: status,
    _response: payload,
  }).catch(() => undefined);
}
