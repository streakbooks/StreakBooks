import { describe, expect, it } from "vitest";
import {
  assertProviderRouted,
  defaultRoutedProviders,
  lockedSubscriptionProvider,
  normaliseRoutedProviders,
  paymentMethodsForRoutedCountry,
  preferredCheckoutProvider,
} from "@/lib/billing/provider-resolution";

describe("hybrid provider resolution", () => {
  it("defaults India to Razorpay and international to Stripe", () => {
    expect(defaultRoutedProviders("IN")).toEqual(["razorpay"]);
    expect(defaultRoutedProviders("US")).toEqual(["stripe"]);
    expect(defaultRoutedProviders("GB")).toEqual(["stripe"]);
    expect(defaultRoutedProviders("DE")).toEqual(["stripe"]);
  });

  it("uses DB routes when present and ignores unknown providers", () => {
    expect(normaliseRoutedProviders(["razorpay", "stripe", "paypal"], "IN")).toEqual([
      "razorpay",
      "stripe",
    ]);
    expect(normaliseRoutedProviders([], "IN")).toEqual(["razorpay"]);
  });

  it("offers Razorpay card + UPI + e-mandate for India when Razorpay is routed", () => {
    const methods = paymentMethodsForRoutedCountry("IN", { stripe: true, razorpay: true }, [
      "razorpay",
    ]);
    expect(methods.map((m) => m.id)).toEqual(["card", "upi", "emandate"]);
    expect(methods.every((m) => m.provider === "razorpay")).toBe(true);
  });

  it("offers only Stripe card for US/UK when Stripe is routed", () => {
    for (const country of ["US", "GB"] as const) {
      const methods = paymentMethodsForRoutedCountry(country, { stripe: true, razorpay: true }, [
        "stripe",
      ]);
      expect(methods.map((m) => m.id)).toEqual(["card"]);
    }
  });

  it("marks methods unavailable when the routed provider has no keys", () => {
    const methods = paymentMethodsForRoutedCountry("IN", { stripe: true, razorpay: false }, [
      "razorpay",
    ]);
    expect(methods.every((m) => !m.available)).toBe(true);
  });

  it("refuses an unrouted provider and locks subscription providers", () => {
    expect(() => assertProviderRouted("stripe", ["razorpay"])).toThrow(/not offered/i);
    expect(lockedSubscriptionProvider("razorpay")).toBe("razorpay");
    expect(lockedSubscriptionProvider("none")).toBeNull();
    expect(
      preferredCheckoutProvider(["razorpay", "stripe"], { stripe: true, razorpay: false }),
    ).toBe("stripe");
    expect(preferredCheckoutProvider(["razorpay"], { stripe: true, razorpay: false })).toBeNull();
  });
});
