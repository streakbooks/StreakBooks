import { describe, expect, it } from "vitest";
import {
  razorpayHostedCheckoutUrl,
  razorpaySubscriptionReturnUrl,
} from "@/lib/billing/razorpay-hosted-checkout.server";

describe("razorpay hosted checkout urls", () => {
  it("builds a same-origin bridge url with subscription and return targets", () => {
    const url = new URL(
      razorpayHostedCheckoutUrl({
        origin: "https://streak-books.vercel.app",
        subscriptionId: "sub_abc123",
        checkoutId: "11111111-1111-4111-8111-111111111111",
        successUrl: "https://streak-books.vercel.app/settings?section=subscription&checkout=success",
        cancelUrl: "https://streak-books.vercel.app/settings?section=subscription&checkout=cancel",
        planName: "Standard",
        email: "rohit@streakbooks.com",
      }),
    );
    expect(url.pathname).toBe("/api/billing/razorpay/hosted");
    expect(url.searchParams.get("subscription_id")).toBe("sub_abc123");
    expect(url.searchParams.get("plan_name")).toBe("Standard");
    expect(url.searchParams.get("email")).toBe("rohit@streakbooks.com");
  });

  it("returns to subscription settings after payment", () => {
    expect(razorpaySubscriptionReturnUrl("https://streak-books.vercel.app")).toBe(
      "https://streak-books.vercel.app/settings?section=subscription&checkout=success",
    );
  });
});
