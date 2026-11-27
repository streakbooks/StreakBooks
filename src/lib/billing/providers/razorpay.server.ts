import { assertRazorpayTestKey } from "@/lib/billing/provider-keys";
import {
  modeFromRazorpayKey,
  unixToIso,
  type PaymentMode,
} from "@/lib/billing/providers/normalise";

/** Server-only Razorpay client. Test keys unless STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true. */
export type RazorpayClient = {
  mode: PaymentMode;
  request: (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function razorpayConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env["RAZORPAY_KEY_ID"] && env["RAZORPAY_KEY_SECRET"]);
}

export function createRazorpayClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): RazorpayClient {
  const key = env["RAZORPAY_KEY_ID"];
  const secret = env["RAZORPAY_KEY_SECRET"];
  if (!key || !secret)
    throw new Error("UPI and e-mandate need RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  assertRazorpayTestKey(key, env);
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
  return {
    mode: modeFromRazorpayKey(key),
    async request(method, path, body) {
      const response = await fetchImpl(`https://api.razorpay.com/v1/${path}`, {
        method,
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: auth, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: { description?: string };
      };
      if (!response.ok) {
        throw new RazorpayError(
          payload.error?.description ?? `Razorpay request failed (${response.status}).`,
          response.status,
        );
      }
      return payload;
    },
  };
}

/** Razorpay plans have no idempotency key; the database keeps the first mapping recorded. */
export async function createRazorpayPlan(
  client: RazorpayClient,
  input: {
    planPriceId: string;
    planName: string;
    currency: string;
    amountMinor: number;
    interval: "month" | "year";
  },
): Promise<{ productId: null; priceId: string }> {
  const plan = await client.request("POST", "plans", {
    period: input.interval === "year" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: `StreakBooks ${input.planName}`,
      amount: input.amountMinor,
      currency: input.currency,
    },
    notes: { plan_price_id: input.planPriceId },
  });
  const id = typeof plan["id"] === "string" ? plan["id"] : "";
  if (!id) throw new Error("Razorpay did not return a plan.");
  return { productId: null, priceId: id };
}

export function razorpaySubscriptionRequest(input: {
  planId: string;
  interval: "month" | "year";
  checkoutId: string;
  companyId: string;
  planCode: string;
  startAtUnix: number | null;
  offerId?: string | null;
}): Record<string, unknown> {
  return {
    plan_id: input.planId,
    // Razorpay requires a cycle count; this keeps the mandate open for ten years.
    total_count: input.interval === "year" ? 10 : 120,
    customer_notify: true,
    notes: {
      checkout_id: input.checkoutId,
      company_id: input.companyId,
      plan_code: input.planCode,
    },
    ...(input.startAtUnix != null ? { start_at: input.startAtUnix } : {}),
    ...(input.offerId ? { offer_id: input.offerId } : {}),
  };
}

/**
 * Cancels at the end of the current cycle. Before the first cycle (an authorised mandate waiting
 * for the trial to end) Razorpay only allows an immediate cancellation, which ends nothing paid.
 */
export async function razorpayCancel(
  client: RazorpayClient,
  subscriptionId: string,
): Promise<{ effectiveAt: string }> {
  const path = `subscriptions/${encodeURIComponent(subscriptionId)}/cancel`;
  try {
    const subscription = await client.request("POST", path, { cancel_at_cycle_end: true });
    return { effectiveAt: unixToIso(subscription["current_end"]) ?? new Date().toISOString() };
  } catch (error) {
    if (error instanceof RazorpayError && /no billing cycle/i.test(error.message)) {
      await client.request("POST", path, { cancel_at_cycle_end: false });
      return { effectiveAt: new Date().toISOString() };
    }
    throw error;
  }
}

export type RazorpaySubscriptionInspect = {
  id: string;
  status: string;
  plan_id: string | null;
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  notes: Record<string, unknown>;
  payment_method: string | null;
};

/** Read subscription cycle + mandate hints before attempting a plan change. */
export async function razorpayInspectSubscription(
  client: RazorpayClient,
  subscriptionId: string,
): Promise<RazorpaySubscriptionInspect> {
  const raw = await client.request("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`);
  const notesRaw = raw["notes"];
  const notes =
    notesRaw && typeof notesRaw === "object" && !Array.isArray(notesRaw)
      ? (notesRaw as Record<string, unknown>)
      : {};
  return {
    id: String(raw["id"] ?? subscriptionId),
    status: String(raw["status"] ?? ""),
    plan_id: raw["plan_id"] == null ? null : String(raw["plan_id"]),
    current_start: typeof raw["current_start"] === "number" ? raw["current_start"] : null,
    current_end: typeof raw["current_end"] === "number" ? raw["current_end"] : null,
    charge_at: typeof raw["charge_at"] === "number" ? raw["charge_at"] : null,
    notes,
    payment_method: raw["payment_method"] == null ? null : String(raw["payment_method"]),
  };
}

/**
 * Update plan when the mandate allows it.
 * Card: `now` for immediate upgrades (Razorpay charges/refunds the difference).
 * UPI / e-mandate: Razorpay rejects — surface a clear migration message.
 */
export async function razorpayChangePlan(
  client: RazorpayClient,
  subscriptionId: string,
  planId: string,
  scheduleChangeAt: "now" | "cycle_end" = "cycle_end",
): Promise<Record<string, unknown>> {
  try {
    return await client.request("PATCH", `subscriptions/${encodeURIComponent(subscriptionId)}`, {
      plan_id: planId,
      schedule_change_at: scheduleChangeAt,
      customer_notify: true,
    });
  } catch (error) {
    if (error instanceof RazorpayError && /(UPI|emandate|e-mandate)/i.test(error.message)) {
      throw new Error(
        "UPI and e-mandate subscriptions cannot change plan. Cancel this subscription and subscribe to the new plan after it ends.",
      );
    }
    if (
      error instanceof RazorpayError &&
      /offer|domestic card|only.*update.*offer/i.test(error.message)
    ) {
      throw new Error(
        "This Razorpay card mandate only allows offer updates mid-cycle. Schedule the plan change for renewal, or cancel and subscribe again.",
      );
    }
    throw error;
  }
}

/** Razorpay refunds have no idempotency key; the refund id is recorded before any retry. */
export async function createRazorpayRefund(
  client: RazorpayClient,
  input: { paymentId: string; amountMinor: number; refundId: string },
): Promise<{ id: string; status: "succeeded" | "pending" | "failed" }> {
  const refund = await client.request(
    "POST",
    `payments/${encodeURIComponent(input.paymentId)}/refund`,
    {
      amount: input.amountMinor,
      notes: { linkbooks_refund_id: input.refundId },
    },
  );
  const status = refund["status"];
  return {
    id: String(refund["id"] ?? ""),
    status: status === "processed" ? "succeeded" : status === "failed" ? "failed" : "pending",
  };
}
