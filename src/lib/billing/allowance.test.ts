import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allowanceLevel } from "@/lib/billing/allowance";
import { planMargin } from "@/lib/billing/margin";
import { canEditPlatformPrices, mayBootstrapPlatformOwner } from "@/lib/billing/platform-access";
import { assertRazorpayTestKey, assertStripeTestKey } from "@/lib/billing/provider-keys";

describe("allowanceLevel", () => {
  it("warns at 80 percent and blocks above the cap", () => {
    expect(allowanceLevel(79, 100)).toBe("ok");
    expect(allowanceLevel(80, 100)).toBe("warn");
    expect(allowanceLevel(100, 100, 1)).toBe("block");
    expect(allowanceLevel(1000, null)).toBe("ok");
  });
});

describe("platform access", () => {
  it("bootstraps only the configured email when no owner exists", () => {
    expect(mayBootstrapPlatformOwner("Owner@Example.com", "owner@example.com", 0)).toBe(true);
    expect(mayBootstrapPlatformOwner("other@example.com", "owner@example.com", 0)).toBe(false);
    expect(mayBootstrapPlatformOwner("owner@example.com", "owner@example.com", 1)).toBe(false);
    expect(mayBootstrapPlatformOwner("owner@example.com", "", 0)).toBe(false);
  });

  it("does not let an organisation admin edit prices", () => {
    expect(canEditPlatformPrices(null, false)).toBe(false);
    expect(canEditPlatformPrices("platform_finance", true)).toBe(false);
    expect(canEditPlatformPrices("platform_finance", false)).toBe(true);
    expect(canEditPlatformPrices("platform_owner", true)).toBe(true);
  });
});

describe("provider keys", () => {
  it("refuses live Stripe and Razorpay keys", () => {
    expect(() => assertStripeTestKey("sk_live_abc")).toThrow(/sk_test_/);
    expect(() => assertStripeTestKey("sk_test_abc")).not.toThrow();
    expect(() => assertRazorpayTestKey("rzp_live_abc")).toThrow(/rzp_test_/);
  });
});

describe("seed catalog", () => {
  it("keeps the approved USD list prices", () => {
    const seed = JSON.parse(
      readFileSync(new URL("./seed-catalog.json", import.meta.url), "utf8"),
    ) as {
      plans: { code: string; monthlyUsd: number }[];
    };
    expect(seed.plans.map((plan) => plan.monthlyUsd)).toEqual([1200, 3000, 6000, 9900]);
  });
});

describe("planMargin", () => {
  it("flags a plan below 70 percent at typical usage", () => {
    const result = planMargin(1200, [
      { key: "card", unitCostMinorUsd: 500, typicalQuantity: 1, maxQuantity: 1 },
    ]);
    expect(result.belowTypicalFloor).toBe(true);
    expect(result.typicalMarginBps).toBeLessThan(7000);
  });
});
