import { describe, expect, it } from "vitest";
import { midCycleFeatureChange, prorateMinor } from "./proration";

describe("mid-cycle proration", () => {
  it("charges the remaining days when a feature is added", () => {
    expect(prorateMinor(3000, 10, 30)).toBe(1000);
  });

  it("credits the remaining days when a feature is removed", () => {
    expect(prorateMinor(-3000, 10, 30)).toBe(-1000);
  });

  it("does not call a provider without a test secret", () => {
    expect(
      midCycleFeatureChange({
        previousMinor: 3000,
        nextMinor: 3500,
        daysRemaining: 15,
        daysInPeriod: 30,
        stripeSecret: null,
      }),
    ).toEqual({
      status: "blocked",
      reason: "A test-mode payment secret is required before a mid-cycle change.",
      prorationMinor: 250,
      providerCalled: false,
    });
  });

  it("refuses a live secret and still does not call a provider", () => {
    expect(() =>
      midCycleFeatureChange({
        previousMinor: 3500,
        nextMinor: 3000,
        daysRemaining: 15,
        daysInPeriod: 30,
        stripeSecret: "sk_live_abc",
      }),
    ).toThrow(/LINKBOOKS_ALLOW_LIVE_PAYMENT_KEYS/);
  });

  it("keeps a test-secret change unsent", () => {
    expect(
      midCycleFeatureChange({
        previousMinor: 3000,
        nextMinor: 3500,
        daysRemaining: 15,
        daysInPeriod: 30,
        stripeSecret: "sk_test_abc",
      }).providerCalled,
    ).toBe(false);
  });
});
