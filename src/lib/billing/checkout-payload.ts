import type { BillingCurrency, BillingInterval } from "@/lib/billing/pricing";

export type CheckoutDraft = {
  checkoutId: string;
  companyId: string;
  planCode: string;
  planName: string;
  interval: BillingInterval;
  currency: BillingCurrency;
  unitAmountMinor: number;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds. Omit when the remaining trial is under 48 hours. */
  trialEndUnix: number | null;
};

export function stripeCheckoutBody(draft: CheckoutDraft): URLSearchParams {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", draft.successUrl);
  body.set("cancel_url", draft.cancelUrl);
  body.set("client_reference_id", draft.checkoutId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", draft.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(draft.unitAmountMinor));
  body.set(
    "line_items[0][price_data][recurring][interval]",
    draft.interval === "year" ? "year" : "month",
  );
  body.set("line_items[0][price_data][product_data][name]", `LinkBooks ${draft.planName}`);
  body.set("metadata[checkout_id]", draft.checkoutId);
  body.set("metadata[company_id]", draft.companyId);
  body.set("metadata[plan_code]", draft.planCode);
  body.set("subscription_data[metadata][checkout_id]", draft.checkoutId);
  body.set("subscription_data[metadata][company_id]", draft.companyId);
  body.set("subscription_data[metadata][plan_code]", draft.planCode);
  if (draft.trialEndUnix != null) {
    body.set("subscription_data[trial_end]", String(draft.trialEndUnix));
  }
  return body;
}

export function razorpayPlanBody(draft: CheckoutDraft): Record<string, unknown> {
  return {
    period: draft.interval === "year" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: `LinkBooks ${draft.planName}`,
      amount: draft.unitAmountMinor,
      currency: draft.currency,
    },
    notes: {
      checkout_id: draft.checkoutId,
      company_id: draft.companyId,
      plan_code: draft.planCode,
    },
  };
}

export function razorpaySubscriptionBody(
  draft: CheckoutDraft,
  planId: string,
): Record<string, unknown> {
  return {
    plan_id: planId,
    total_count: draft.interval === "year" ? 5 : 60,
    customer_notify: 1,
    notes: {
      checkout_id: draft.checkoutId,
      company_id: draft.companyId,
      plan_code: draft.planCode,
    },
    ...(draft.trialEndUnix != null ? { start_at: draft.trialEndUnix } : {}),
  };
}

/** Stripe rejects a trial_end less than 48 hours ahead. */
export function trialEndUnixOrNull(trialEndsAt: string | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end)) return null;
  const minimum = now.getTime() + 48 * 60 * 60 * 1000;
  if (end < minimum) return null;
  return Math.floor(end / 1000);
}
