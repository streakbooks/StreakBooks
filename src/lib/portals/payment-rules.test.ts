import { describe, expect, it } from "vitest";
import {
  assertPortalPaymentAmount,
  holdsInvoiceBalance,
  payableRoom,
  resolvePortalCheckoutMode,
} from "./payment-rules";

describe("portal payment room", () => {
  it("keeps posted receipts and in-progress holds from overlapping", () => {
    expect(payableRoom(10_000, 4_000)).toBe(6_000);
    expect(payableRoom(10_000, 10_000)).toBe(0);
    expect(payableRoom(10_000, 12_000)).toBe(0);
  });

  it("rejects a zero, fractional, or oversized amount", () => {
    expect(() => assertPortalPaymentAmount(500, 0)).toThrow(/greater than zero/);
    expect(() => assertPortalPaymentAmount(500, 1.5)).toThrow(/greater than zero/);
    expect(() => assertPortalPaymentAmount(500, 501)).toThrow(/already in progress/);
    expect(() => assertPortalPaymentAmount(500, 500)).not.toThrow();
  });

  it("holds balance only before the receipt is posted", () => {
    expect(holdsInvoiceBalance("processing")).toBe(true);
    expect(holdsInvoiceBalance("succeeded")).toBe(false);
    expect(holdsInvoiceBalance("refunded")).toBe(false);
  });
});

describe("portal checkout mode", () => {
  it("uses Stripe when a secret is configured and reports live mode from the key", () => {
    expect(
      resolvePortalCheckoutMode({ stripeSecretKey: "sk_test_123", allowSandbox: true }),
    ).toEqual({
      mode: "stripe",
      livemode: false,
    });
    expect(
      resolvePortalCheckoutMode({ stripeSecretKey: "sk_live_123", allowSandbox: false }),
    ).toEqual({
      mode: "stripe",
      livemode: true,
    });
  });

  it("does not treat an unrecognised secret as a configured provider", () => {
    expect(
      resolvePortalCheckoutMode({ stripeSecretKey: "not-a-stripe-key", allowSandbox: false }),
    ).toEqual({
      mode: "instructions",
      livemode: false,
    });
  });

  it("offers sandbox only when the organisation has turned it on", () => {
    expect(resolvePortalCheckoutMode({ allowSandbox: false })).toEqual({
      mode: "instructions",
      livemode: false,
    });
    expect(
      resolvePortalCheckoutMode({
        razorpayKeyId: "rzp_test_x",
        razorpayKeySecret: "secret",
        allowSandbox: true,
      }),
    ).toEqual({ mode: "razorpay", livemode: false });
  });
});
