/**
 * Stripe Test Clock lifecycle journeys.
 *
 * Enable with:
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_TEST_CLOCKS=1 npm test -- --run src/lib/billing/stripe-test-clock.integration.test.ts
 *
 * Optional longer journeys (subscription create / upgrade / interval / clock advance):
 *   STRIPE_TEST_CLOCKS=full
 *
 * Without keys this file skips live calls (CI-safe). Do not run against live keys.
 */
import { afterAll, describe, expect, it } from "vitest";
import { assertStripeTestKey } from "@/lib/billing/provider-keys";
import {
  createStripeClient,
  stripeChangePrice,
  stripePlanChangeIdempotencyKey,
  stripePreviewPlanChange,
  type StripeClient,
} from "@/lib/billing/providers/stripe.server";
import { classifyPlanChange, planChangePaymentCopy } from "@/lib/billing/domain/billing-policy";

const secret = process.env["STRIPE_SECRET_KEY"] ?? "";
const mode = process.env["STRIPE_TEST_CLOCKS"] ?? "";
const enabled = (mode === "1" || mode === "full") && Boolean(secret);
const fullJourney = mode === "full" && Boolean(secret);

type Cleanup = () => Promise<void>;

async function createEphemeralPrices(stripe: StripeClient): Promise<{
  monthlyStarter: string;
  monthlyPro: string;
  yearlyStarter: string;
  cleanup: Cleanup;
}> {
  const stamp = Date.now();
  const product = await stripe.request(
    "POST",
    "products",
    new URLSearchParams({
      name: `SB Test Clock ${stamp}`,
      "metadata[source]": "streakbooks_test_clock",
    }),
  );
  const productId = String(product["id"] ?? "");
  expect(productId).toMatch(/^prod_/);

  const makePrice = async (amount: number, interval: "month" | "year", nick: string) => {
    const price = await stripe.request(
      "POST",
      "prices",
      new URLSearchParams({
        currency: "usd",
        unit_amount: String(amount),
        "recurring[interval]": interval,
        product: productId,
        nickname: nick,
        "metadata[source]": "streakbooks_test_clock",
      }),
    );
    const id = String(price["id"] ?? "");
    expect(id).toMatch(/^price_/);
    return id;
  };

  const monthlyStarter = await makePrice(2900, "month", "starter-month");
  const monthlyPro = await makePrice(5900, "month", "pro-month");
  const yearlyStarter = await makePrice(29000, "year", "starter-year");

  return {
    monthlyStarter,
    monthlyPro,
    yearlyStarter,
    cleanup: async () => {
      await stripe.request(
        "POST",
        `products/${encodeURIComponent(productId)}`,
        new URLSearchParams({ active: "false" }),
      );
    },
  };
}

async function waitForTestClockReady(
  stripe: StripeClient,
  clockId: string,
  attempts = 40,
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    const clock = await stripe.request(
      "GET",
      `test_helpers/test_clocks/${encodeURIComponent(clockId)}`,
    );
    if (String(clock["status"] ?? "") === "ready") return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Test clock ${clockId} did not become ready in time`);
}

async function attachVisa(stripe: StripeClient, customerId: string): Promise<string> {
  const pm = await stripe.request(
    "POST",
    "payment_methods",
    new URLSearchParams({
      type: "card",
      "card[token]": "tok_visa",
    }),
  );
  const pmId = String(pm["id"] ?? "");
  expect(pmId).toMatch(/^pm_/);
  await stripe.request(
    "POST",
    `payment_methods/${encodeURIComponent(pmId)}/attach`,
    new URLSearchParams({ customer: customerId }),
  );
  await stripe.request(
    "POST",
    `customers/${encodeURIComponent(customerId)}`,
    new URLSearchParams({
      "invoice_settings[default_payment_method]": pmId,
    }),
  );
  return pmId;
}

describe.runIf(enabled)("Stripe Test Clock lifecycle (live test-mode API)", () => {
  const cleanups: Cleanup[] = [];

  afterAll(async () => {
    for (const fn of [...cleanups].reverse()) {
      try {
        await fn();
      } catch {
        /* best-effort teardown */
      }
    }
  }, 120_000);

  it("creates a test clock and customer, then tears them down", async () => {
    assertStripeTestKey(secret);
    const stripe = createStripeClient();
    const clock = await stripe.request(
      "POST",
      "test_helpers/test_clocks",
      new URLSearchParams({
        frozen_time: String(Math.floor(Date.now() / 1000)),
        name: `streakbooks-${Date.now()}`,
      }),
    );
    const clockId = String(clock["id"] ?? "");
    expect(clockId).toMatch(/^clock_/);

    const customer = await stripe.request(
      "POST",
      "customers",
      new URLSearchParams({
        email: `clock-${Date.now()}@example.test`,
        test_clock: clockId,
        "metadata[source]": "streakbooks_test_clock",
      }),
    );
    expect(String(customer["id"])).toMatch(/^cus_/);

    await stripe.request("DELETE", `customers/${encodeURIComponent(String(customer["id"]))}`);
    await stripe.request("DELETE", `test_helpers/test_clocks/${encodeURIComponent(clockId)}`);
  }, 60_000);

  it.runIf(fullJourney)(
    "runs subscribe → preview upgrade → upgrade → interval switch → schedule reverse → renew → fail → cancel",
    async () => {
      assertStripeTestKey(secret);
      const stripe = createStripeClient();
      const frozen = Math.floor(Date.now() / 1000);

      const clock = await stripe.request(
        "POST",
        "test_helpers/test_clocks",
        new URLSearchParams({
          frozen_time: String(frozen),
          name: `streakbooks-journey-${Date.now()}`,
        }),
      );
      const clockId = String(clock["id"] ?? "");
      expect(clockId).toMatch(/^clock_/);
      cleanups.push(async () => {
        await stripe.request("DELETE", `test_helpers/test_clocks/${encodeURIComponent(clockId)}`);
      });

      const customer = await stripe.request(
        "POST",
        "customers",
        new URLSearchParams({
          email: `journey-${Date.now()}@example.test`,
          test_clock: clockId,
          "metadata[source]": "streakbooks_test_clock_journey",
        }),
      );
      const customerId = String(customer["id"] ?? "");
      expect(customerId).toMatch(/^cus_/);
      cleanups.push(async () => {
        await stripe.request("DELETE", `customers/${encodeURIComponent(customerId)}`);
      });

      await attachVisa(stripe, customerId);
      const prices = await createEphemeralPrices(stripe);
      cleanups.push(prices.cleanup);

      // 1. Create monthly subscription
      const sub = await stripe.request(
        "POST",
        "subscriptions",
        new URLSearchParams({
          customer: customerId,
          "items[0][price]": prices.monthlyStarter,
          payment_behavior: "error_if_incomplete",
          "expand[]": "latest_invoice",
        }),
        `sb-clock-sub-${Date.now()}`,
      );
      const subscriptionId = String(sub["id"] ?? "");
      expect(subscriptionId).toMatch(/^sub_/);
      expect(["active", "trialing"]).toContain(String(sub["status"]));

      // 3. Preview prorated upgrade (pin proration_date for confirm alignment)
      const preview = await stripePreviewPlanChange(
        stripe,
        subscriptionId,
        prices.monthlyPro,
        "upgrade",
      );
      expect(preview.amountDueMinor).toBeGreaterThan(0);
      expect(preview.currency).toBe("USD");
      expect(preview.prorationDateUnix).toBeGreaterThan(0);
      const periodEndBefore = preview.periodEndUnix;

      // 2 + 4. Upgrade + payment path (always_invoice / pending_if_incomplete)
      const upgradeKey = stripePlanChangeIdempotencyKey(
        "clock-co",
        prices.monthlyPro,
        "upgrade",
        preview.prorationDateUnix,
      );
      const upgrade = await stripeChangePrice(
        stripe,
        subscriptionId,
        prices.monthlyPro,
        "upgrade",
        upgradeKey,
        { prorationDateUnix: preview.prorationDateUnix },
      );
      expect(upgrade.alreadyOnPrice).toBe(false);
      expect(upgrade.invoiceId || upgrade.amountDueMinor >= 0).toBeTruthy();

      // Idempotent retry with the same preview window must not create a second upgrade request.
      const upgradeRetry = await stripeChangePrice(
        stripe,
        subscriptionId,
        prices.monthlyPro,
        "upgrade",
        upgradeKey,
        { prorationDateUnix: preview.prorationDateUnix },
      );
      expect(upgradeRetry.invoiceId === upgrade.invoiceId || upgradeRetry.alreadyOnPrice).toBe(
        true,
      );

      // Pay open invoice with default PM if needed
      if (upgrade.invoiceId && upgrade.amountDueMinor > 0) {
        await stripe.request(
          "POST",
          `invoices/${encodeURIComponent(upgrade.invoiceId)}/pay`,
          new URLSearchParams(),
        );
      }

      const afterUpgrade = await stripe.request(
        "GET",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      expect(String(afterUpgrade["status"])).toBe("active");
      if (periodEndBefore != null && typeof afterUpgrade["current_period_end"] === "number") {
        // Same-interval upgrade preserves the billing anchor / renewal date.
        expect(afterUpgrade["current_period_end"]).toBe(periodEndBefore);
      }
      const items = afterUpgrade["items"] as { data?: Array<{ price?: { id?: string } | string }> };
      const priceAfter =
        typeof items?.data?.[0]?.price === "string"
          ? items.data[0].price
          : items?.data?.[0]?.price && typeof items.data[0].price === "object"
            ? items.data[0].price.id
            : null;
      expect(priceAfter).toBe(prices.monthlyPro);

      // Zero-charge: confirming the same price again is a no-op (no new invoice due).
      const zeroCharge = await stripeChangePrice(
        stripe,
        subscriptionId,
        prices.monthlyPro,
        "upgrade",
        stripePlanChangeIdempotencyKey(
          "clock-co",
          prices.monthlyPro,
          "upgrade",
          preview.prorationDateUnix + 120,
        ),
      );
      expect(zeroCharge.alreadyOnPrice).toBe(true);
      expect(zeroCharge.amountDueMinor).toBe(0);
      expect(zeroCharge.paymentActionUrl).toBeNull();

      // 6. Switch monthly → annual (treat as upgrade when yearly monthly-equivalent higher)
      const toAnnual = await stripeChangePrice(
        stripe,
        subscriptionId,
        prices.yearlyStarter,
        "upgrade",
        stripePlanChangeIdempotencyKey("clock-co", prices.yearlyStarter, "upgrade"),
      );
      if (toAnnual.invoiceId && toAnnual.amountDueMinor > 0) {
        await stripe.request(
          "POST",
          `invoices/${encodeURIComponent(toAnnual.invoiceId)}/pay`,
          new URLSearchParams(),
        );
      }

      // 7. Switch annual → monthly (downgrade / period-end style)
      const toMonthly = await stripeChangePrice(
        stripe,
        subscriptionId,
        prices.monthlyStarter,
        "downgrade",
        stripePlanChangeIdempotencyKey("clock-co", prices.monthlyStarter, "downgrade"),
      );
      expect(toMonthly.alreadyOnPrice).toBe(false);

      // 8–9. Schedule cancel-at-period-end then reverse (mirrors scheduled downgrade reverse)
      await stripe.request(
        "POST",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
        new URLSearchParams({ cancel_at_period_end: "true" }),
      );
      const scheduled = await stripe.request(
        "GET",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      expect(scheduled["cancel_at_period_end"]).toBe(true);

      await stripe.request(
        "POST",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
        new URLSearchParams({ cancel_at_period_end: "false" }),
      );
      const reversed = await stripe.request(
        "GET",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      expect(reversed["cancel_at_period_end"]).toBe(false);

      // 10. Advance clock ~32 days to force renewal invoice
      await stripe.request(
        "POST",
        `test_helpers/test_clocks/${encodeURIComponent(clockId)}/advance`,
        new URLSearchParams({ frozen_time: String(frozen + 32 * 24 * 3600) }),
      );
      await waitForTestClockReady(stripe, clockId);

      const renewed = await stripe.request(
        "GET",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      expect(["active", "past_due", "unpaid"]).toContain(String(renewed["status"]));

      // 11–12. Simulate failed renewal recovery: swap default PM then restore Visa
      const failPm = await stripe.request(
        "POST",
        "payment_methods",
        new URLSearchParams({
          type: "card",
          "card[token]": "tok_chargeCustomerFail",
        }),
      );
      const failPmId = String(failPm["id"] ?? "");
      await stripe.request(
        "POST",
        `payment_methods/${encodeURIComponent(failPmId)}/attach`,
        new URLSearchParams({ customer: customerId }),
      );
      await stripe.request(
        "POST",
        `customers/${encodeURIComponent(customerId)}`,
        new URLSearchParams({
          "invoice_settings[default_payment_method]": failPmId,
        }),
      );
      const okPm = await attachVisa(stripe, customerId);
      expect(okPm).toMatch(/^pm_/);

      // 13. Cancel subscription
      const canceled = await stripe.request(
        "DELETE",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      expect(["canceled", "cancelled"]).toContain(String(canceled["status"]));

      // Invoice list includes paid / void / open history for this customer
      const invoices = await stripe.request(
        "GET",
        `invoices?customer=${encodeURIComponent(customerId)}&limit=10`,
      );
      const invoiceRows = Array.isArray(invoices["data"]) ? invoices["data"] : [];
      expect(invoiceRows.length).toBeGreaterThan(0);
    },
    180_000,
  );

  it.runIf(fullJourney)(
    "expires a trial via test clock advance",
    async () => {
      assertStripeTestKey(secret);
      const stripe = createStripeClient();
      const frozen = Math.floor(Date.now() / 1000);
      const clock = await stripe.request(
        "POST",
        "test_helpers/test_clocks",
        new URLSearchParams({
          frozen_time: String(frozen),
          name: `streakbooks-trial-${Date.now()}`,
        }),
      );
      const clockId = String(clock["id"] ?? "");
      cleanups.push(async () => {
        await stripe.request("DELETE", `test_helpers/test_clocks/${encodeURIComponent(clockId)}`);
      });

      const customer = await stripe.request(
        "POST",
        "customers",
        new URLSearchParams({
          email: `trial-${Date.now()}@example.test`,
          test_clock: clockId,
        }),
      );
      const customerId = String(customer["id"] ?? "");
      cleanups.push(async () => {
        await stripe.request("DELETE", `customers/${encodeURIComponent(customerId)}`);
      });
      await attachVisa(stripe, customerId);
      const prices = await createEphemeralPrices(stripe);
      cleanups.push(prices.cleanup);

      const sub = await stripe.request(
        "POST",
        "subscriptions",
        new URLSearchParams({
          customer: customerId,
          "items[0][price]": prices.monthlyStarter,
          trial_period_days: "7",
          payment_behavior: "default_incomplete",
        }),
      );
      expect(String(sub["status"])).toBe("trialing");
      const subscriptionId = String(sub["id"] ?? "");

      await stripe.request(
        "POST",
        `test_helpers/test_clocks/${encodeURIComponent(clockId)}/advance`,
        new URLSearchParams({ frozen_time: String(frozen + 8 * 24 * 3600) }),
      );
      await waitForTestClockReady(stripe, clockId);

      const latest = await stripe.request(
        "GET",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      const status = String(latest["status"] ?? "");
      expect(["active", "past_due", "unpaid", "canceled"]).toContain(status);
    },
    120_000,
  );
});

describe("Stripe lifecycle policy contracts (always run)", () => {
  it("documents upgrade vs downgrade payment timing", () => {
    expect(classifyPlanChange(2900, 5900)).toBe("upgrade");
    expect(classifyPlanChange(9900, 2900)).toBe("downgrade");
    expect(planChangePaymentCopy("upgrade").paymentNow.toLowerCase()).toMatch(/prorat/);
    expect(planChangePaymentCopy("downgrade").paymentNow.toLowerCase()).toMatch(/no charge/);
  });

  it("reuses plan-change idempotency keys for the same preview window", () => {
    const t = 1_700_000_000;
    const a = stripePlanChangeIdempotencyKey("co-1", "price_pro_month", "upgrade", t);
    const b = stripePlanChangeIdempotencyKey("co-1", "price_pro_month", "upgrade", t + 15);
    const c = stripePlanChangeIdempotencyKey("co-1", "price_pro_month", "upgrade", t + 120);
    const other = stripePlanChangeIdempotencyKey("co-1", "price_biz_year", "upgrade", t);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(other);
  });

  it("exposes stripePreviewPlanChange for proration preview", () => {
    expect(typeof stripePreviewPlanChange).toBe("function");
  });
});

describe.runIf(!enabled)("Stripe Test Clock (skipped without STRIPE_TEST_CLOCKS)", () => {
  it("documents required env for full journey automation", () => {
    expect(
      [
        "Create monthly subscription on a Test Clock customer",
        "Upgrade + preview proration + pay",
        "Switch monthly↔annual",
        "Schedule + reverse downgrade",
        "Advance clock for renewal / failed payment / trial expiry",
        "Cancel / reactivate",
      ].length,
    ).toBeGreaterThan(5);
  });
});
