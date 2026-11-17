import { describe, expect, it } from "vitest";
import {
  discountBpsToPercent,
  discountPercentToBps,
  discountedUnitPriceMinor,
  findEffectiveDiscountRule,
  resolveDraftDiscountedUnitPrice,
  validateDiscountRuleInput,
  type DraftDiscountRule,
} from "./price-list-discounts";
import type { DraftTierPriceRule } from "./price-list-tiers";

const discount = (
  id: string,
  threshold: string,
  start: string,
  end: string | null,
  bps: number,
): DraftDiscountRule => ({
  id,
  product_id: "p",
  min_quantity: threshold,
  effective_from: start,
  effective_to: end,
  discount_bps: bps,
});

describe("percentage price-list discounts", () => {
  it("parses 2-place percentages exactly and rejects over-100 and extra precision", () => {
    expect(discountPercentToBps("12.50")).toBe(1250);
    expect(discountPercentToBps("0")).toBe(0);
    expect(discountPercentToBps("100.00")).toBe(10000);
    expect(discountBpsToPercent(1250)).toBe("12.50");
    for (const invalid of ["100.01", "0.001", "-3", "foo", "101", ""]) {
      expect(() => discountPercentToBps(invalid)).toThrow();
    }
  });

  it("rounds HALF UP to minor currency units without float errors", () => {
    expect(discountedUnitPriceMinor(999, 1250)).toBe(874);
    expect(discountedUnitPriceMinor(1, 5000)).toBe(1);
    expect(discountedUnitPriceMinor(1, 10000)).toBe(0);
    expect(discountedUnitPriceMinor(999, 0)).toBe(999);
    expect(discountedUnitPriceMinor(1_000_000, 3333)).toBe(666700);
  });

  it("selects one rule by quantity then date rather than stacking discounts", () => {
    const rules = [
      discount("old", "1", "2026-01-01", null, 500),
      discount("tier", "10", "2026-01-01", null, 1000),
      discount("new", "10", "2026-10-01", "2026-11-30", 2000),
      discount("high", "100", "2026-01-01", null, 3000),
    ];
    expect(findEffectiveDiscountRule(rules, "p", "10", "2026-11-06")?.id).toBe("new");
    expect(findEffectiveDiscountRule(rules, "p", "10", "2026-12-01")?.id).toBe("tier");
    expect(findEffectiveDiscountRule(rules, "p", "100", "2026-11-06")?.id).toBe("high");
  });

  it("applies percent to fixed tier then fixed override then base catalogue price", () => {
    const tiers: DraftTierPriceRule[] = [
      {
        id: "fixed-tier",
        product_id: "p",
        min_quantity: "10",
        effective_from: "2026-01-01",
        effective_to: null,
        unit_price_minor: 800,
      },
    ];
    const percentages = [discount("percent", "1", "2026-01-01", null, 1000)];
    expect(
      resolveDraftDiscountedUnitPrice(
        "p",
        1200,
        "10",
        "2026-11-06",
        { p: 1000 },
        tiers,
        percentages,
      ),
    ).toBe(720);
    expect(
      resolveDraftDiscountedUnitPrice(
        "p",
        1200,
        "1",
        "2026-11-06",
        { p: 1000 },
        tiers,
        percentages,
      ),
    ).toBe(900);
    expect(
      resolveDraftDiscountedUnitPrice("p", 1200, "1", "2026-11-06", {}, tiers, percentages),
    ).toBe(1080);
  });

  it("preserves zero-price rules, ignores ineligible dates and unrelated products", () => {
    const rules = [discount("zero", "1", "2026-01-01", "2026-11-30", 10000)];
    expect(resolveDraftDiscountedUnitPrice("p", 1000, "1", "2026-11-30", {}, [], rules)).toBe(0);
    expect(
      resolveDraftDiscountedUnitPrice("p", 1000, "1", "2026-12-01", {}, [], rules),
    ).toBeUndefined();
    expect(
      resolveDraftDiscountedUnitPrice("other", 1000, "1", "2026-11-06", {}, [], rules),
    ).toBeUndefined();
  });

  it("rejects invalid stored money and discount rates, and validates ranges", () => {
    expect(
      validateDiscountRuleInput({
        minQuantity: "01.2500",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-11-30",
        discountBps: 2500,
      }).minQuantity,
    ).toBe("1.25");
    expect(() =>
      validateDiscountRuleInput({
        minQuantity: "1",
        effectiveFrom: "2026-12-01",
        effectiveTo: "2026-11-01",
        discountBps: 10,
      }),
    ).toThrow(/Effective-to/);
    expect(() => discountedUnitPriceMinor(Number.MAX_SAFE_INTEGER + 1, 100)).toThrow(/base price/);
    expect(() => discountedUnitPriceMinor(100, 10001)).toThrow(/Discount/);
    expect(() =>
      resolveDraftDiscountedUnitPrice(
        "p",
        undefined,
        "1",
        "2026-11-06",
        {},
        [],
        [discount("missing", "1", "2026-01-01", null, 100)],
      ),
    ).toThrow(/catalogue base/);
  });
});
