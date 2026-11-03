import { describe, expect, it } from "vitest";
import {
  assertDiscountCap,
  assertPriceFloor,
  planChangeKind,
  stripePortalBody,
  stripeRefundBody,
  stripeUpgradeBody,
} from "@/lib/billing/provider-actions";

describe("provider actions", () => {
  it("blocks a price under the floor and a promo over 50 percent", () => {
    expect(() => assertPriceFloor("USD", "month", 100)).toThrow(/floor/);
    expect(() => assertPriceFloor("USD", "month", 1200)).not.toThrow();
    expect(() => assertDiscountCap(5001)).toThrow(/50%/);
  });

  it("treats a higher price as an immediate upgrade", () => {
    expect(planChangeKind(1200, 3000)).toBe("upgrade");
    expect(planChangeKind(3000, 1200)).toBe("downgrade");
  });

  it("builds portal, proration and refund requests", () => {
    expect(stripePortalBody("cus_1", "https://example.com/settings").get("customer")).toBe("cus_1");
    expect(stripeUpgradeBody("si_1", "price_1").get("proration_behavior")).toBe(
      "create_prorations",
    );
    expect(stripeRefundBody("pi_1", 1200, "duplicate").get("amount")).toBe("1200");
  });
});
