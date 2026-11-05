/**
 * Provider payloads -> provider-agnostic events applied by public.billing_apply_provider_event.
 * Pure functions: no network, no database.
 */
export type ProviderId = "stripe" | "razorpay";
export type PaymentMode = "test" | "live";

export type NormalisedEvent =
  | {
      kind: "checkout_completed";
      data: {
        checkoutId: string;
        subscriptionId: string;
        customerId: string | null;
        status: "active" | "trialing";
        periodEnd: string | null;
        cancelAtPeriodEnd: boolean;
        occurredAt: string;
      };
    }
  | {
      kind: "subscription_state";
      data: {
        subscriptionId: string;
        status: "active" | "trialing" | "past_due" | "paused" | null;
        periodEnd: string | null;
        cancelAtPeriodEnd: boolean | null;
        providerPriceId: string | null;
        occurredAt: string;
      };
    }
  | { kind: "payment_failed"; data: { subscriptionId: string; occurredAt: string } }
  | { kind: "subscription_ended"; data: { subscriptionId: string; occurredAt: string } };

type Json = Record<string, unknown>;

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

export function unixToIso(value: unknown): string | null {
  const seconds =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------- Stripe

/** Pinned API version: billing periods live on subscription items from 2025-03-31.basil. */
export const STRIPE_API_VERSION = "2025-03-31.basil";

function firstItem(subscription: Json): Json {
  const items = obj(subscription["items"]);
  const data = items["data"];
  return Array.isArray(data) ? obj(data[0]) : {};
}

/** Item-level period end (current API), falling back to the pre-basil subscription field. */
export function stripePeriodEnd(subscription: Json): string | null {
  return (
    unixToIso(firstItem(subscription)["current_period_end"]) ??
    unixToIso(subscription["current_period_end"])
  );
}

export function stripePriceId(subscription: Json): string | null {
  const price = firstItem(subscription)["price"];
  return typeof price === "string" ? price : str(obj(price)["id"]);
}

export type StripeSubscriptionState =
  | { ended: true }
  | {
      ended: false;
      status: "active" | "trialing" | "past_due" | "paused";
      periodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      providerPriceId: string | null;
    };

export function stripeSubscriptionState(subscription: Json): StripeSubscriptionState | null {
  const status = str(subscription["status"]);
  if (status === "canceled" || status === "incomplete_expired") return { ended: true };
  const paused =
    subscription["pause_collection"] != null && subscription["pause_collection"] !== false;
  const mapped = paused
    ? "paused"
    : status === "active"
      ? "active"
      : status === "trialing"
        ? "trialing"
        : status === "past_due" || status === "unpaid"
          ? "past_due"
          : status === "paused"
            ? "paused"
            : null;
  if (!mapped) return null;
  return {
    ended: false,
    status: mapped,
    periodEnd: stripePeriodEnd(subscription),
    cancelAtPeriodEnd:
      subscription["cancel_at_period_end"] === true || subscription["cancel_at"] != null,
    providerPriceId: stripePriceId(subscription),
  };
}

/** Paid access only after payment, or a no-payment trial with a mandate on file. */
export function mayActivateStripeCheckout(
  paymentStatus: string | null,
  subscriptionStatus: string | null,
): boolean {
  return (
    (paymentStatus === "paid" &&
      (subscriptionStatus === "active" || subscriptionStatus === "trialing")) ||
    (paymentStatus === "no_payment_required" && subscriptionStatus === "trialing")
  );
}

export function stripeInvoiceSubscriptionId(invoice: Json): string | null {
  const legacy = str(invoice["subscription"]);
  if (legacy) return legacy;
  const details = obj(obj(invoice["parent"])["subscription_details"]);
  return str(details["subscription"]);
}

export function stripeCheckoutId(session: Json): string | null {
  return str(obj(session["metadata"])["checkout_id"]) ?? str(session["client_reference_id"]);
}

/** Events whose meaning is "re-read the subscription and apply its current state". */
export const STRIPE_STATE_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
]);

export function stripeStateEvent(
  subscriptionId: string,
  subscription: Json,
  occurredAt: string,
): NormalisedEvent | null {
  const state = stripeSubscriptionState(subscription);
  if (!state) return null;
  if (state.ended) return { kind: "subscription_ended", data: { subscriptionId, occurredAt } };
  return {
    kind: "subscription_state",
    data: {
      subscriptionId,
      status: state.status,
      periodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      providerPriceId: state.providerPriceId,
      occurredAt,
    },
  };
}

// ---------------------------------------------------------------------------- Razorpay

export type RazorpayEvent = {
  event?: string;
  created_at?: number;
  payload?: { subscription?: { entity?: Json } };
};

/** Razorpay events carry the subscription entity, so no re-read is needed. */
export function razorpayEvents(event: RazorpayEvent): NormalisedEvent[] {
  const type = event.event ?? "";
  const entity = obj(event.payload?.subscription?.entity);
  const subscriptionId = str(entity["id"]);
  if (!subscriptionId) return [];
  const occurredAt = unixToIso(event.created_at) ?? new Date().toISOString();
  const checkoutId = str(obj(entity["notes"])["checkout_id"]);
  const periodEnd = unixToIso(entity["current_end"]);
  const planId = str(entity["plan_id"]);
  const customerId = str(entity["customer_id"]);
  const out: NormalisedEvent[] = [];
  const activate = (status: "active" | "trialing") => {
    if (!checkoutId) return;
    out.push({
      kind: "checkout_completed",
      data: {
        checkoutId,
        subscriptionId,
        customerId,
        status,
        periodEnd,
        cancelAtPeriodEnd: false,
        occurredAt,
      },
    });
  };
  const state = (status: "active" | "trialing" | "past_due" | "paused" | null) =>
    out.push({
      kind: "subscription_state",
      data: {
        subscriptionId,
        status,
        periodEnd,
        cancelAtPeriodEnd: null,
        providerPriceId: planId,
        occurredAt,
      },
    });

  switch (type) {
    case "subscription.authenticated": {
      // Mandate authorised; the first charge waits for start_at (the end of a no-card trial).
      const startAt = Number(entity["start_at"] ?? 0);
      if (startAt * 1000 > Date.parse(occurredAt) + 60_000) activate("trialing");
      break;
    }
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      activate("active");
      state("active");
      break;
    case "subscription.pending":
    case "subscription.halted":
      out.push({ kind: "payment_failed", data: { subscriptionId, occurredAt } });
      break;
    case "subscription.paused":
      state("paused");
      break;
    case "subscription.updated":
      state(str(entity["status"]) === "active" ? "active" : null);
      break;
    case "subscription.cancelled":
    case "subscription.completed":
    case "subscription.expired":
      out.push({ kind: "subscription_ended", data: { subscriptionId, occurredAt } });
      break;
    default:
      break;
  }
  return out;
}

export function modeFromStripeSecret(secret: string): PaymentMode {
  return secret.startsWith("sk_live_") ? "live" : "test";
}

export function modeFromRazorpayKey(keyId: string): PaymentMode {
  return keyId.startsWith("rzp_live_") ? "live" : "test";
}
