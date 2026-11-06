import { describe, expect, it } from "vitest";
import {
  mayActivateStripeCheckout,
  modeFromRazorpayKey,
  modeFromStripeSecret,
  razorpayEvents,
  stripeCheckoutId,
  stripeInvoiceSubscriptionId,
  stripePeriodEnd,
  stripeStateEvent,
  stripeSubscriptionState,
} from "./normalise";

const basil = {
  id: "sub_1",
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ id: "si_1", current_period_end: 1767225600, price: { id: "price_pro" } }] },
};

describe("Stripe", () => {
  it("reads the item-level period end of the pinned API version", () => {
    expect(stripePeriodEnd(basil)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back to the pre-basil subscription period end", () => {
    expect(stripePeriodEnd({ current_period_end: 1767225600, items: { data: [{}] } })).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("maps subscription statuses", () => {
    expect(stripeSubscriptionState(basil)).toEqual({
      ended: false,
      status: "active",
      periodEnd: "2026-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      providerPriceId: "price_pro",
    });
    expect(stripeSubscriptionState({ ...basil, status: "unpaid" })).toMatchObject({
      status: "past_due",
    });
    expect(
      stripeSubscriptionState({ ...basil, pause_collection: { behavior: "void" } }),
    ).toMatchObject({
      status: "paused",
    });
    expect(stripeSubscriptionState({ ...basil, status: "canceled" })).toEqual({ ended: true });
    expect(stripeSubscriptionState({ ...basil, status: "incomplete" })).toBeNull();
    expect(stripeSubscriptionState({ ...basil, cancel_at: 1767225600 })).toMatchObject({
      cancelAtPeriodEnd: true,
    });
  });

  it("builds a state or end event", () => {
    expect(stripeStateEvent("sub_1", basil, "2025-12-01T00:00:00.000Z")).toMatchObject({
      kind: "subscription_state",
      data: { subscriptionId: "sub_1", status: "active", providerPriceId: "price_pro" },
    });
    expect(stripeStateEvent("sub_1", { status: "canceled" }, "t")).toEqual({
      kind: "subscription_ended",
      data: { subscriptionId: "sub_1", occurredAt: "t" },
    });
  });

  it("activates only paid checkouts or no-payment trials", () => {
    expect(mayActivateStripeCheckout("paid", "active")).toBe(true);
    expect(mayActivateStripeCheckout("no_payment_required", "trialing")).toBe(true);
    expect(mayActivateStripeCheckout("unpaid", "active")).toBe(false);
    expect(mayActivateStripeCheckout("no_payment_required", "active")).toBe(false);
  });

  it("finds invoice subscriptions in both API shapes", () => {
    expect(stripeInvoiceSubscriptionId({ subscription: "sub_old" })).toBe("sub_old");
    expect(
      stripeInvoiceSubscriptionId({
        parent: { subscription_details: { subscription: "sub_new" } },
      }),
    ).toBe("sub_new");
  });

  it("reads the checkout reference", () => {
    expect(stripeCheckoutId({ metadata: { checkout_id: "c1" } })).toBe("c1");
    expect(stripeCheckoutId({ client_reference_id: "c2" })).toBe("c2");
  });
});

describe("Razorpay", () => {
  const entity = {
    id: "sub_rzp",
    plan_id: "plan_pro",
    customer_id: "cust_1",
    status: "active",
    current_end: 1767225600,
    start_at: 1764547200,
    notes: { checkout_id: "chk_1" },
  };
  const at = (event: string, extra: Record<string, unknown> = {}) => ({
    event,
    created_at: 1764547200,
    payload: { subscription: { entity: { ...entity, ...extra } } },
  });

  it("activates the checkout and applies the state when charged", () => {
    const events = razorpayEvents(at("subscription.charged"));
    expect(events.map((event) => event.kind)).toEqual(["checkout_completed", "subscription_state"]);
    expect(events[1]).toMatchObject({
      data: {
        status: "active",
        providerPriceId: "plan_pro",
        periodEnd: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  it("treats an authorised mandate before the trial end as a trial", () => {
    expect(
      razorpayEvents(at("subscription.authenticated", { start_at: 1767225600 }))[0],
    ).toMatchObject({
      kind: "checkout_completed",
      data: { status: "trialing" },
    });
    expect(razorpayEvents(at("subscription.authenticated"))).toEqual([]);
  });

  it("maps failures, pauses and endings", () => {
    expect(razorpayEvents(at("subscription.halted"))[0]?.kind).toBe("payment_failed");
    expect(razorpayEvents(at("subscription.paused"))[0]).toMatchObject({
      data: { status: "paused" },
    });
    expect(razorpayEvents(at("subscription.cancelled"))[0]?.kind).toBe("subscription_ended");
    expect(razorpayEvents(at("subscription.completed"))[0]?.kind).toBe("subscription_ended");
    expect(razorpayEvents(at("payment.captured"))).toEqual([]);
  });

  it("ignores payloads without a subscription", () => {
    expect(razorpayEvents({ event: "subscription.charged", payload: {} })).toEqual([]);
  });
});

describe("mode", () => {
  it("derives test or live from the key", () => {
    expect(modeFromStripeSecret("sk_test_x")).toBe("test");
    expect(modeFromStripeSecret("sk_live_x")).toBe("live");
    expect(modeFromRazorpayKey("rzp_test_x")).toBe("test");
    expect(modeFromRazorpayKey("rzp_live_x")).toBe("live");
  });
});

describe("payments and refunds", () => {
  it("reads a paid Stripe invoice under the pinned API version", async () => {
    const { stripeInvoicePayment } = await import("./normalise");
    const payment = stripeInvoicePayment(
      {
        id: "in_1",
        amount_paid: 2400,
        currency: "usd",
        total_taxes: [{ amount: 400 }],
        status_transitions: { paid_at: 1767225600 },
        payments: {
          data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_1" } }],
        },
        lines: { data: [{ period: { start: 1764547200, end: 1767225600 } }] },
      },
      "sub_1",
    );
    expect(payment).toMatchObject({
      paymentId: "pi_1",
      invoiceRef: "in_1",
      amountMinor: 2400,
      currency: "USD",
      taxMinor: 400,
      paidAt: "2026-01-01T00:00:00.000Z",
      periodStart: "2025-12-01T00:00:00.000Z",
    });
    expect(
      stripeInvoicePayment({ id: "in_0", amount_paid: 0, currency: "usd" }, "sub_1"),
    ).toBeNull();
  });

  it("reads a Razorpay charge without inventing tax", async () => {
    const { razorpayPayment } = await import("./normalise");
    expect(
      razorpayPayment({
        event: "subscription.charged",
        created_at: 1767225600,
        payload: {
          subscription: {
            entity: { id: "sub_r", current_start: 1764547200, current_end: 1767225600 },
          },
          payment: {
            entity: {
              id: "pay_r",
              amount: 99900,
              currency: "INR",
              method: "upi",
              invoice_id: "inv_r",
            },
          },
        },
      }),
    ).toMatchObject({
      paymentId: "pay_r",
      amountMinor: 99900,
      currency: "INR",
      taxMinor: null,
      method: "upi",
    });
    expect(razorpayPayment({ event: "subscription.activated" })).toBeNull();
  });

  it("maps refund outcomes", async () => {
    const { razorpayRefund, stripeRefund } = await import("./normalise");
    expect(stripeRefund("refund.updated", { id: "re_1", status: "succeeded" })?.status).toBe(
      "succeeded",
    );
    expect(
      stripeRefund("refund.failed", {
        id: "re_1",
        status: "failed",
        failure_reason: "expired_or_canceled_card",
      }),
    ).toEqual({
      providerRefundId: "re_1",
      status: "failed",
      failure: "expired_or_canceled_card",
    });
    expect(stripeRefund("charge.succeeded", { id: "ch_1" })).toBeNull();
    expect(
      razorpayRefund({
        event: "refund.processed",
        payload: { refund: { entity: { id: "rfnd_1" } } },
      })?.status,
    ).toBe("succeeded");
    expect(
      razorpayRefund({
        event: "refund.created",
        payload: { refund: { entity: { id: "rfnd_1" } } },
      }),
    ).toBeNull();
  });
});
