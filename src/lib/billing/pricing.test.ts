import { describe, expect, it } from "vitest";
import { stripeCheckoutBody, trialEndUnixOrNull } from "@/lib/billing/checkout-payload";
import {
  CATALOG,
  billingCurrencyForCompany,
  formatMinor,
  listAmount,
  quotePrice,
  subscriptionAccess,
  type OfferRule,
} from "@/lib/billing/pricing";
import {
  stripeSignatureHeader,
  verifyRazorpaySignature,
  verifyStripeSignature,
} from "@/lib/billing/signatures";
import { razorpaySignatureHex } from "@/lib/billing/signatures";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function offer(partial: Partial<OfferRule> & Pick<OfferRule, "kind" | "code">): OfferRule {
  return {
    percentBps: 0,
    amountMinor: 0,
    amountCurrency: null,
    extraTrialDays: 0,
    extraFreeMonths: 0,
    durationMonths: null,
    intervals: "any",
    planCodes: "any",
    startsOn: null,
    endsOn: null,
    maxRedemptions: null,
    redemptionCount: 0,
    active: true,
    ...partial,
  };
}

describe("catalog prices", () => {
  it("undercuts Xero, QuickBooks and FreshBooks standing monthly prices", () => {
    const starter = CATALOG.find((plan) => plan.code === "starter");
    const growth = CATALOG.find((plan) => plan.code === "growth");
    const pro = CATALOG.find((plan) => plan.code === "pro");
    expect(starter?.monthly.USD).toBe(1200);
    expect(growth?.monthly.USD).toBe(3000);
    expect(pro?.monthly.USD).toBe(6000);
    expect(starter!.monthly.USD).toBeLessThan(23_00);
    expect(growth!.monthly.USD).toBeLessThan(59_00);
    expect(pro!.monthly.USD).toBeLessThan(97_00);
  });

  it("bills India in rupees under the QuickBooks India display prices", () => {
    const starter = CATALOG.find((plan) => plan.code === "starter");
    expect(starter?.monthly.INR).toBe(99900);
    expect(formatMinor(49900, "INR")).toContain("499");
  });

  it("keeps the same posting features on every plan and only limits volume", () => {
    for (const plan of CATALOG) {
      expect(plan.highlights.some((line) => /ledger|quotes|invoices|everything/i.test(line))).toBe(
        true,
      );
    }
    expect(CATALOG[0]?.limits.multiCurrency).toBe(false);
    expect(CATALOG[1]?.limits.invoicesPerMonth).toBeNull();
  });
});

describe("quotePrice", () => {
  it("charges ten months on an annual plan when two months are free", () => {
    expect(listAmount(2900, "year", 2)).toBe(2900 * 10);
    const quote = quotePrice({
      monthlyMinor: 2900,
      interval: "year",
      annualFreeMonths: 2,
      currency: "GBP",
      trialDays: 30,
      offer: null,
      now: NOW,
      planCode: "standard",
    });
    expect(quote.dueMinor).toBe(29_000);
    expect(quote.freeMonths).toBe(2);
    expect(quote.trialDays).toBe(30);
  });

  it("applies a percentage promo and refuses an expired or exhausted code", () => {
    const quote = quotePrice({
      monthlyMinor: 1500,
      interval: "month",
      annualFreeMonths: 2,
      currency: "USD",
      trialDays: 30,
      offer: offer({ code: "launch20", kind: "percent", percentBps: 2000 }),
      now: NOW,
      planCode: "starter",
    });
    expect(quote.dueMinor).toBe(1200);
    expect(quote.recurringMinor).toBe(1500);
    expect(quote.promoDurationMonths).toBe(1);
    expect(quote.discountMinor).toBe(300);
    expect(quote.offerCode).toBe("LAUNCH20");

    expect(() =>
      quotePrice({
        monthlyMinor: 1500,
        interval: "month",
        annualFreeMonths: 2,
        currency: "USD",
        trialDays: 30,
        offer: offer({ code: "OLD", kind: "percent", percentBps: 1000, endsOn: "2026-10-01" }),
        now: NOW,
        planCode: "starter",
      }),
    ).toThrow(/expired/);

    expect(() =>
      quotePrice({
        monthlyMinor: 1500,
        interval: "month",
        annualFreeMonths: 2,
        currency: "USD",
        trialDays: 30,
        offer: offer({
          code: "USED",
          kind: "amount",
          amountMinor: 500,
          amountCurrency: "USD",
          maxRedemptions: 1,
          redemptionCount: 1,
        }),
        now: NOW,
        planCode: "starter",
      }),
    ).toThrow(/fully used/);
  });

  it("adds extra free months and extra trial days from an offer", () => {
    const annual = quotePrice({
      monthlyMinor: 1000,
      interval: "year",
      annualFreeMonths: 2,
      currency: "GBP",
      trialDays: 30,
      offer: offer({ code: "YEAR4", kind: "extra_free_months", extraFreeMonths: 2 }),
      now: NOW,
      planCode: "standard",
    });
    expect(annual.freeMonths).toBe(4);
    expect(annual.dueMinor).toBe(8000);
    expect(annual.listMinor).toBe(10000);

    const trial = quotePrice({
      monthlyMinor: 1000,
      interval: "month",
      annualFreeMonths: 2,
      currency: "GBP",
      trialDays: 30,
      offer: offer({ code: "MORE", kind: "extra_trial_days", extraTrialDays: 14 }),
      now: NOW,
      planCode: "standard",
    });
    expect(trial.trialDays).toBe(44);
    expect(trial.dueMinor).toBe(1000);
  });

  it("rejects an amount promo in the wrong currency", () => {
    expect(() =>
      quotePrice({
        monthlyMinor: 49900,
        interval: "month",
        annualFreeMonths: 2,
        currency: "INR",
        trialDays: 30,
        offer: offer({ code: "GBP5", kind: "amount", amountMinor: 500, amountCurrency: "GBP" }),
        now: NOW,
        planCode: "starter",
      }),
    ).toThrow(/GBP/);
  });
});

describe("subscriptionAccess", () => {
  it("keeps a live trial and a complimentary organisation fully open", () => {
    expect(
      subscriptionAccess({
        status: "trialing",
        trialEndsAt: "2026-11-30T00:00:00.000Z",
        currentPeriodEnd: null,
        now: NOW,
        graceDays: 7,
      }),
    ).toBe("full");
    expect(
      subscriptionAccess({
        status: "complimentary",
        trialEndsAt: null,
        currentPeriodEnd: null,
        now: NOW,
        graceDays: 7,
      }),
    ).toBe("full");
  });

  it("becomes read-only after the trial, and allows a past-due grace window", () => {
    expect(
      subscriptionAccess({
        status: "trialing",
        trialEndsAt: "2026-10-01T00:00:00.000Z",
        currentPeriodEnd: null,
        now: NOW,
        graceDays: 7,
      }),
    ).toBe("read_only");
    expect(
      subscriptionAccess({
        status: "past_due",
        trialEndsAt: null,
        currentPeriodEnd: "2026-10-28T00:00:00.000Z",
        now: NOW,
        graceDays: 7,
      }),
    ).toBe("full");
    expect(
      subscriptionAccess({
        status: "past_due",
        trialEndsAt: null,
        currentPeriodEnd: "2026-10-01T00:00:00.000Z",
        now: NOW,
        graceDays: 7,
      }),
    ).toBe("read_only");
  });
});

describe("currency and checkout payload", () => {
  it("bills an unsupported company currency in GBP", () => {
    expect(billingCurrencyForCompany("eur")).toBe("GBP");
    expect(billingCurrencyForCompany("inr")).toBe("INR");
  });

  it("sends Stripe a recurring price and skips a trial ending inside 48 hours", () => {
    const body = stripeCheckoutBody({
      checkoutId: "chk_1",
      companyId: "co_1",
      planCode: "standard",
      planName: "Standard",
      interval: "year",
      currency: "GBP",
      unitAmountMinor: 29000,
      successUrl: "https://app.example/settings?section=subscription&checkout=success",
      cancelUrl: "https://app.example/settings?section=subscription&checkout=cancel",
      trialEndUnix: 1_800_000_000,
    });
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price_data][recurring][interval]")).toBe("year");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("29000");
    expect(body.get("subscription_data[trial_end]")).toBe("1800000000");
    expect(trialEndUnixOrNull("2026-10-31T12:00:00.000Z", NOW)).toBeNull();
    expect(trialEndUnixOrNull("2026-11-15T12:00:00.000Z", NOW)).toBe(
      Math.floor(Date.parse("2026-11-15T12:00:00.000Z") / 1000),
    );
  });
});

describe("webhook signatures", () => {
  it("accepts a fresh Stripe signature and rejects a stale one", () => {
    const payload = '{"type":"checkout.session.completed"}';
    const secret = "whsec_test";
    const now = 1_700_000_000;
    const header = stripeSignatureHeader(payload, secret, now);
    expect(() => verifyStripeSignature(payload, header, secret, now)).not.toThrow();
    expect(() => verifyStripeSignature(payload, header, secret, now + 600)).toThrow(/time window/);
    expect(() => verifyStripeSignature(payload, header, "other", now)).toThrow(/does not match/);
  });

  it("accepts a Razorpay body signature", () => {
    const payload = '{"event":"subscription.activated"}';
    const secret = "razorpay_whsec";
    const header = razorpaySignatureHex(payload, secret);
    expect(() => verifyRazorpaySignature(payload, header, secret)).not.toThrow();
    expect(() => verifyRazorpaySignature(payload, "deadbeef", secret)).toThrow(/does not match/);
  });
});
