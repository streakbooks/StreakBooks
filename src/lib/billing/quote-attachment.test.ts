import { describe, expect, it } from "vitest";
import { attachQuote } from "./quote-attachment";

const quote = {
  companyId: "95d0eeee-5703-4a73-a073-6c081724692e",
  planCode: "growth",
  currency: "USD",
  monthlyTotalMinor: 3000,
  lines: [{ featureKey: "white_label", quantity: 1, monthlyNetMinor: 500 }],
};

describe("attachQuote", () => {
  it("does not attach an unpriced selection and does not grant the feature", () => {
    const result = attachQuote(
      { ...quote, lines: [{ featureKey: "white_label", quantity: 1, monthlyNetMinor: null }] },
      "sk_test_abc",
    );
    expect(result).toEqual({ status: "unpriced", grantsEntitlement: false });
  });

  it("blocks the attachment when no test secret is configured", () => {
    expect(attachQuote(quote, null)).toMatchObject({
      status: "blocked",
      grantsEntitlement: false,
    });
  });

  it("refuses a live secret and keeps the feature ungranted", () => {
    expect(() => attachQuote(quote, "sk_live_abc")).toThrow(/STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS/);
  });

  it("returns a ready instruction for a test secret without granting a feature", () => {
    expect(attachQuote(quote, "sk_test_abc")).toEqual({
      status: "ready",
      grantsEntitlement: false,
      companyId: quote.companyId,
      planCode: "growth",
      currency: "USD",
      monthlyTotalMinor: 3000,
      featureKeys: ["white_label"],
    });
  });
});
