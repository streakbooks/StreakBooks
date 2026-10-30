import { describe, expect, it } from "vitest";
import { mayActivateStripeCheckout } from "@/lib/billing/webhooks";

describe("verified subscription activation", () => {
  it("activates a confirmed paid subscription", () => {
    expect(mayActivateStripeCheckout("paid", "active")).toBe(true);
  });

  it("activates a legitimate trial without collecting payment", () => {
    expect(mayActivateStripeCheckout("no_payment_required", "trialing")).toBe(true);
  });

  it("never grants paid access for an asynchronous or incomplete payment", () => {
    expect(mayActivateStripeCheckout("unpaid", "active")).toBe(false);
    expect(mayActivateStripeCheckout("unpaid", "incomplete")).toBe(false);
    expect(mayActivateStripeCheckout("no_payment_required", "active")).toBe(false);
    expect(mayActivateStripeCheckout(null, "active")).toBe(false);
    expect(mayActivateStripeCheckout("paid", "canceled")).toBe(false);
  });
});
