import { describe, expect, it } from "vitest";
import {
  assertDiscountCap,
  assertPriceFloor,
  stripePortalBody,
  stripeRefundBody,
} from "@/lib/billing/provider-actions";

describe("provider actions", () => {
  it("blocks a price under the floor and a promo over 50 percent", () => {
    expect(() => assertPriceFloor("USD", "month", 100)).toThrow(/floor/);
    expect(() => assertPriceFloor("USD", "month", 1200)).not.toThrow();
    expect(() => assertDiscountCap(5001)).toThrow(/50%/);
  });

  it("builds portal and refund requests", () => {
    expect(stripePortalBody("cus_1", "https://example.com/settings").get("customer")).toBe("cus_1");
    expect(stripeRefundBody("pi_1", 1200, "duplicate").get("amount")).toBe("1200");
  });
});
