import { describe, expect, it, vi } from "vitest";
import {
  createRazorpayClient,
  razorpayCancel,
  razorpayChangePlan,
  razorpaySubscriptionRequest,
} from "./razorpay.server";
import {
  createStripeClient,
  stripeChangePrice,
  stripePriceCheckoutBody,
  stripeSetCancelAtPeriodEnd,
} from "./stripe.server";

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const stripeEnv = { STRIPE_SECRET_KEY: "sk_test_abc" };
const razorpayEnv = { RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "secret" };

describe("Stripe client", () => {
  it("pins the API version and sends idempotency keys", async () => {
    const { fetch, calls } = mockFetch([
      { body: { items: { data: [{ current_period_end: 1767225600 }] } } },
    ]);
    const client = createStripeClient(stripeEnv, fetch);
    const result = await stripeSetCancelAtPeriodEnd(client, "sub_1", true, "key-1");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["Stripe-Version"]).toBe("2025-03-31.basil");
    expect(headers["Idempotency-Key"]).toBe("key-1");
    expect(String(calls[0]!.init.body)).toBe("cancel_at_period_end=true");
    expect(result.periodEnd).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refuses live keys without the production flag", () => {
    expect(() => createStripeClient({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(/live keys/);
    expect(
      createStripeClient({
        STRIPE_SECRET_KEY: "sk_live_abc",
        STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS: "true",
      }).mode,
    ).toBe("live");
  });

  it("upgrades with a pending update and downgrades without proration", async () => {
    const subscription = {
      body: { items: { data: [{ id: "si_1", price: { id: "price_cur" } }] } },
    };
    const monthPrice = { body: { id: "price_cur", recurring: { interval: "month" } } };
    const targetMonth = { body: { id: "price_biz", recurring: { interval: "month" } } };
    const upgraded = {
      body: {
        items: { data: [{ id: "si_1", price: { id: "price_biz" } }] },
        latest_invoice: "in_up",
      },
    };
    const invoice = {
      body: {
        id: "in_up",
        status: "open",
        amount_due: 1000,
        hosted_invoice_url: "https://invoice.stripe.com/i/up",
      },
    };
    const downgraded = {
      body: { items: { data: [{ id: "si_1", price: { id: "price_std" } }] } },
    };
    const openInvoices = { body: { data: [] } };
    const { fetch, calls } = mockFetch([
      // upgrade: GET sub → list open invoices → GET current price → GET target → POST update → GET invoice
      subscription,
      openInvoices,
      monthPrice,
      targetMonth,
      upgraded,
      invoice,
      // downgrade: GET sub → GET current → GET target → POST update
      subscription,
      monthPrice,
      { body: { id: "price_std", recurring: { interval: "month" } } },
      downgraded,
    ]);
    const client = createStripeClient(stripeEnv, fetch);
    await stripeChangePrice(client, "sub_1", "price_biz", "upgrade", "k1", {
      prorationDateUnix: 1_700_000_000,
    });
    await stripeChangePrice(client, "sub_1", "price_std", "downgrade", "k2");
    const upgrade = new URLSearchParams(String(calls[4]!.init.body));
    expect(upgrade.get("payment_behavior")).toBe("pending_if_incomplete");
    expect(upgrade.get("proration_behavior")).toBe("always_invoice");
    expect(upgrade.get("proration_date")).toBe("1700000000");
    expect(upgrade.get("billing_cycle_anchor")).toBe("unchanged");
    expect(upgrade.get("items[0][price]")).toBe("price_biz");
    const downgrade = new URLSearchParams(String(calls[9]!.init.body));
    expect(downgrade.get("proration_behavior")).toBe("none");
    expect(downgrade.get("billing_cycle_anchor")).toBe("unchanged");
    expect(downgrade.get("payment_behavior")).toBeNull();
  });

  it("omits billing_cycle_anchor when the recurring interval changes", async () => {
    const subscription = {
      body: { items: { data: [{ id: "si_1", price: { id: "price_year" } }] } },
    };
    const { fetch, calls } = mockFetch([
      subscription,
      { body: { id: "price_year", recurring: { interval: "year" } } },
      { body: { id: "price_month", recurring: { interval: "month" } } },
      { body: { items: { data: [{ id: "si_1", price: { id: "price_month" } }] } } },
    ]);
    const client = createStripeClient(stripeEnv, fetch);
    await stripeChangePrice(client, "sub_1", "price_month", "downgrade", "k-interval");
    const body = new URLSearchParams(String(calls[3]!.init.body));
    expect(body.get("proration_behavior")).toBe("none");
    expect(body.get("billing_cycle_anchor")).toBeNull();
  });

  it("checks out with the mapped price, never an inline amount", () => {
    const body = stripePriceCheckoutBody({
      priceId: "price_pro",
      checkoutId: "chk",
      companyId: "co",
      planCode: "pro",
      successUrl: "https://app/s",
      cancelUrl: "https://app/c",
      customerId: null,
      email: "a@example.test",
      trialEndUnix: 1767225600,
    });
    expect(body.get("line_items[0][price]")).toBe("price_pro");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBeNull();
    expect(body.get("subscription_data[metadata][checkout_id]")).toBe("chk");
    expect(body.get("subscription_data[trial_end]")).toBe("1767225600");
  });
});

describe("Razorpay client", () => {
  it("refuses live key ids when RAZORPAY_MODE=test", () => {
    expect(() =>
      createRazorpayClient({
        RAZORPAY_KEY_ID: "rzp_live_abc",
        RAZORPAY_KEY_SECRET: "secret",
        RAZORPAY_MODE: "test",
        STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS: "true",
      }),
    ).toThrow(/RAZORPAY_MODE=test/);
    expect(createRazorpayClient(razorpayEnv).mode).toBe("test");
  });

  it("cancels at cycle end", async () => {
    const { fetch, calls } = mockFetch([{ body: { current_end: 1767225600 } }]);
    const result = await razorpayCancel(createRazorpayClient(razorpayEnv, fetch), "sub_1");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ cancel_at_cycle_end: true });
    expect(result.effectiveAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("cancels immediately when no billing cycle has started", async () => {
    const { fetch, calls } = mockFetch([
      {
        status: 400,
        body: {
          error: {
            description: "Subscription cannot be cancelled since no billing cycle is going on.",
          },
        },
      },
      { body: {} },
    ]);
    await razorpayCancel(createRazorpayClient(razorpayEnv, fetch), "sub_1");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ cancel_at_cycle_end: false });
  });

  it("explains that UPI subscriptions cannot change plan", async () => {
    const { fetch } = mockFetch([
      {
        status: 400,
        body: {
          error: { description: "subscriptions cannot be updated when payment mode is UPI" },
        },
      },
    ]);
    await expect(
      razorpayChangePlan(createRazorpayClient(razorpayEnv, fetch), "sub_1", "plan_x"),
    ).rejects.toThrow(/cannot change plan/);
  });

  it("schedules plan changes for the cycle end and sets a cycle count", async () => {
    const { fetch, calls } = mockFetch([{ body: {} }]);
    await razorpayChangePlan(createRazorpayClient(razorpayEnv, fetch), "sub_1", "plan_x");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      schedule_change_at: "cycle_end",
    });
    expect(
      razorpaySubscriptionRequest({
        planId: "p",
        interval: "month",
        checkoutId: "c",
        companyId: "co",
        planCode: "pro",
        startAtUnix: null,
      }),
    ).toMatchObject({ total_count: 120, notes: { checkout_id: "c" } });
  });

  it("supports immediate Razorpay plan updates for eligible card mandates", async () => {
    const { fetch, calls } = mockFetch([{ body: { id: "sub_1", status: "active" } }]);
    await razorpayChangePlan(createRazorpayClient(razorpayEnv, fetch), "sub_1", "plan_x", "now");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      schedule_change_at: "now",
    });
  });

  it("cancels immediately for UPI migration replacement and builds migration subscription body", async () => {
    const { razorpayCancelImmediate, razorpayUpiMigrationSubscriptionRequest } =
      await import("./razorpay.server");
    const { fetch, calls } = mockFetch([{ body: { id: "sub_old", status: "cancelled" } }]);
    await razorpayCancelImmediate(createRazorpayClient(razorpayEnv, fetch), "sub_old");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ cancel_at_cycle_end: false });

    const body = razorpayUpiMigrationSubscriptionRequest({
      planId: "plan_pro",
      interval: "month",
      checkoutId: "chk",
      companyId: "co",
      planCode: "pro",
      currency: "INR",
      migrationId: "mig",
      replaceSubscriptionId: "sub_old",
      payMethod: "upi",
      startAtUnix: null,
      upfrontAddonMinor: 25000,
    });
    expect(body["notes"]).toMatchObject({
      migration_id: "mig",
      replace_sub_id: "sub_old",
      pay_method: "upi",
    });
    expect(body["addons"]).toEqual([
      {
        item: {
          name: "Plan upgrade difference (one-time estimate)",
          amount: 25000,
          currency: "INR",
        },
      },
    ]);
  });

  it("inspects Razorpay subscription notes for pay_method", async () => {
    const { razorpayInspectSubscription } = await import("./razorpay.server");
    const { fetch } = mockFetch([
      {
        body: {
          id: "sub_1",
          status: "active",
          plan_id: "plan_x",
          current_start: 1_700_000_000,
          current_end: 1_700_259_200,
          notes: { pay_method: "card" },
          payment_method: "card",
        },
      },
    ]);
    const inspected = await razorpayInspectSubscription(
      createRazorpayClient(razorpayEnv, fetch),
      "sub_1",
    );
    expect(inspected.notes["pay_method"]).toBe("card");
    expect(inspected.payment_method).toBe("card");
    expect(inspected.current_end).toBe(1_700_259_200);
  });
});

describe("coupons at the provider", () => {
  it("creates a Stripe coupon once per code and currency", async () => {
    const { createStripeCoupon } = await import("./stripe.server");
    const { fetch, calls } = mockFetch([{ body: { id: "co_1" } }]);
    const id = await createStripeCoupon(createStripeClient(stripeEnv, fetch), {
      code: "LAUNCH10",
      kind: "percent",
      percentBps: 1000,
      amountMinor: 0,
      currency: "INR",
      durationType: "repeating",
      durationMonths: 3,
    });
    const body = new URLSearchParams(String(calls[0]!.init.body));
    expect(id).toBe("co_1");
    expect(body.get("percent_off")).toBe("10.00");
    expect(body.get("duration")).toBe("repeating");
    expect(body.get("duration_in_months")).toBe("3");
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "linkbooks-coupon-LAUNCH10-INR",
    );
  });

  it("passes the coupon to Stripe Checkout and the offer to Razorpay", async () => {
    const { stripePriceCheckoutBody } = await import("./stripe.server");
    const body = stripePriceCheckoutBody({
      priceId: "price_1",
      checkoutId: "c",
      companyId: "co",
      planCode: "pro",
      successUrl: "s",
      cancelUrl: "c",
      customerId: null,
      email: null,
      trialEndUnix: null,
      couponId: "co_1",
    });
    expect(body.get("discounts[0][coupon]")).toBe("co_1");
    expect(
      razorpaySubscriptionRequest({
        planId: "p",
        interval: "month",
        checkoutId: "c",
        companyId: "co",
        planCode: "pro",
        startAtUnix: null,
        offerId: "offer_1",
      }),
    ).toMatchObject({ offer_id: "offer_1" });
  });
});
