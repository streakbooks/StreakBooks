import { describe, expect, it } from "vitest";
import {
  findEffectiveTier,
  resolveTierUnitPrice,
  validateRuleInput,
  validRuleDate,
} from "./price-list-tiers";
import type { DraftTierPriceRule } from "./price-list-tiers";

const rule = (
  id: string,
  quantity: string,
  start: string,
  end: string | null,
  price: number,
): DraftTierPriceRule => ({
  id,
  product_id: "p1",
  min_quantity: quantity,
  effective_from: start,
  effective_to: end,
  unit_price_minor: price,
});

describe("date-effective quantity pricing", () => {
  it("chooses highest eligible quantity tier at a date, with non-compounding overrides", () => {
    const rules = [
      rule("a", "1", "2026-01-01", null, 1300),
      rule("b", "10", "2026-01-01", null, 1100),
      rule("c", "100", "2026-01-01", null, 900),
    ];
    expect(resolveTierUnitPrice("p1", "9.9999", "2026-11-06", { p1: 1500 }, rules)).toBe(1300);
    expect(resolveTierUnitPrice("p1", "10.0000", "2026-11-06", { p1: 1500 }, rules)).toBe(1100);
    expect(resolveTierUnitPrice("p1", "100", "2026-11-06", { p1: 1500 }, rules)).toBe(900);
    expect(resolveTierUnitPrice("other", "100", "2026-11-06", {}, rules)).toBeUndefined();
  });

  it("honours an exact zero-price tier over a positive fixed-price fallback", () => {
    const zero = [rule("free", "25", "2026-01-01", null, 0)];
    expect(resolveTierUnitPrice("p1", "25", "2026-11-06", { p1: 1000 }, zero)).toBe(0);
  });

  it("compares fractional document quantities exactly without rounding to the tier precision", () => {
    const rules = [rule("tier10", "10", "2026-01-01", null, 500)];
    expect(resolveTierUnitPrice("p1", "9.99999999", "2026-11-06", { p1: 900 }, rules)).toBe(900);
    expect(resolveTierUnitPrice("p1", "10.00000001", "2026-11-06", { p1: 900 }, rules)).toBe(500);
  });

  it("applies inclusive effective dates and falls back when no tier is effective", () => {
    const rules = [rule("a", "5", "2026-11-01", "2026-11-30", 750)];
    expect(resolveTierUnitPrice("p1", "5", "2026-11-01", { p1: 1000 }, rules)).toBe(750);
    expect(resolveTierUnitPrice("p1", "5", "2026-11-30", { p1: 1000 }, rules)).toBe(750);
    expect(resolveTierUnitPrice("p1", "5", "2026-12-01", { p1: 1000 }, rules)).toBe(1000);
    expect(resolveTierUnitPrice("p1", "5", "bad date", {}, rules)).toBeUndefined();
  });

  it("breaks tied thresholds by latest effective date, then stable ID", () => {
    const rules = [
      rule("b", "10", "2026-01-01", null, 900),
      rule("a", "10", "2026-01-01", null, 1000),
      rule("c", "10", "2026-06-01", "2026-12-31", 850),
    ];
    expect(findEffectiveTier(rules, "p1", "10", "2026-03-01")?.id).toBe("a");
    expect(findEffectiveTier(rules, "p1", "10", "2026-07-01")?.id).toBe("c");
  });

  it("normalizes safe decimal quantities, validates exact prices and dates", () => {
    expect(
      validateRuleInput({
        minQuantity: "01.2000",
        effectiveFrom: "2026-11-01",
        effectiveTo: "2026-11-30",
        unitPriceMinor: 0,
      }).minQuantity,
    ).toBe("1.2");
    for (const value of ["0", "-1", "1.00001", "x", "999999999999999"]) {
      expect(() =>
        validateRuleInput({
          minQuantity: value,
          effectiveFrom: "2026-11-01",
          unitPriceMinor: 100,
        }),
      ).toThrow(/Minimum quantity/);
    }
    expect(validRuleDate("2026-02-30")).toBe(false);
    expect(validRuleDate("2028-02-29")).toBe(true);
    expect(() =>
      validateRuleInput({
        minQuantity: "1",
        effectiveFrom: "2026-12-31",
        effectiveTo: "2026-01-01",
        unitPriceMinor: 100,
      }),
    ).toThrow(/Effective-to/);
  });

  it("rejects fractional, unsafe and negative unit-price minor amounts", () => {
    for (const value of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      expect(() =>
        validateRuleInput({
          minQuantity: "1",
          effectiveFrom: "2026-01-01",
          unitPriceMinor: value,
        }),
      ).toThrow(/safe integer/);
    }
  });
});
