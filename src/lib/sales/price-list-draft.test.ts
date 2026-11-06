import { describe, expect, it } from "vitest";
import { emptySalesLine } from "@/lib/sales/line-form-state";
import {
  indexDraftPriceOverrides,
  previewPriceListApplication,
  selectedUnitPriceMinor,
} from "./price-list-draft";

describe("price-list draft application", () => {
  it("prefers an override, including an explicit zero price, over catalogue defaults", () => {
    const prices = indexDraftPriceOverrides([
      { product_id: "a", unit_price_minor: 0 },
      { product_id: "b", unit_price_minor: 4500 },
    ]);
    expect(selectedUnitPriceMinor("a", 2500, prices)).toBe(0);
    expect(selectedUnitPriceMinor("b", 1200, prices)).toBe(4500);
    expect(selectedUnitPriceMinor("c", 1000, prices)).toBe(1000);
  });

  it("reprices only explicitly matched draft lines and preserves accounting fields", () => {
    const first = {
      ...emptySalesLine(),
      productId: "a",
      unitPrice: "17.00",
      discount: "1.20",
      quantity: "3",
      taxRateBps: "1250",
      taxCodeId: "vat",
      accountId: "income",
    };
    const custom = { ...emptySalesLine(), unitPrice: "50.00", description: "Custom line" };
    const unlisted = { ...emptySalesLine(), productId: "other", unitPrice: "5.00" };
    const original = [first, custom, unlisted];
    const preview = previewPriceListApplication(original, { a: 2995 }, "USD");
    expect(preview.changed).toBe(1);
    expect(preview.matched).toBe(1);
    expect(preview.lines[0]).toEqual({ ...first, unitPrice: "29.95" });
    expect(preview.lines[1]).toEqual(custom);
    expect(preview.lines[2]).toEqual(unlisted);
    expect(original[0]?.unitPrice).toBe("17.00");
  });

  it("previews quantity/date tier prices without mutating line quantity, account or tax", () => {
    const first = {
      ...emptySalesLine(), productId: "item", quantity: "12",
      unitPrice: "20.00", accountId: "revenue", taxRateBps: "750",
    };
    const original = [first];
    const tiers = [
      {
        id: "tier", product_id: "item", min_quantity: "10",
        effective_from: "2026-11-01", effective_to: "2026-11-30",
        unit_price_minor: 1500,
      },
    ];
    const active = previewPriceListApplication(
      original, { item: 1800 }, "USD", tiers, "2026-11-06",
    );
    expect(active).toMatchObject({ changed: 1, matched: 1 });
    expect(active.lines[0]).toEqual({ ...first, unitPrice: "15.00" });
    expect(original[0]?.unitPrice).toBe("20.00");
    const expired = previewPriceListApplication(
      original, { item: 1800 }, "USD", tiers, "2026-12-01",
    );
    expect(expired.lines[0]?.unitPrice).toBe("18.00");
  });

  it("previews a percentage-only catalogue discount but never mutates existing lines", () => {
    const first = {
      ...emptySalesLine(), productId: "product", quantity: "3",
      unitPrice: "17.99", discount: "1.50", accountId: "sales",
      taxCodeId: "tax", taxRateBps: "1500",
    };
    const freeText = { ...emptySalesLine(), description: "Custom service", unitPrice: "5.00" };
    const percentRules = [{
      id: "ten-percent", product_id: "product", min_quantity: "1",
      effective_from: "2026-01-01", effective_to: null, discount_bps: 1000,
    }];
    const before = [first, freeText];
    const preview = previewPriceListApplication(
      before, {}, "USD", [], "2026-11-06", percentRules, { product: 2000 },
    );
    expect(preview).toMatchObject({ changed: 1, matched: 1 });
    expect(preview.lines[0]).toEqual({ ...first, unitPrice: "18.00" });
    expect(preview.lines[1]).toEqual(freeText);
    expect(before[0]?.unitPrice).toBe("17.99");
  });

  it("keeps line amount-discount separate after tier and percent adjustments", () => {
    const line = {
      ...emptySalesLine(), productId: "item", quantity: "10",
      unitPrice: "22.00", discount: "3.00", taxRateBps: "800",
    };
    const fixedTier = [{
      id: "fixed", product_id: "item", min_quantity: "10",
      effective_from: "2026-01-01", effective_to: null, unit_price_minor: 1700,
    }];
    const percentRules = [{
      id: "percent", product_id: "item", min_quantity: "1",
      effective_from: "2026-01-01", effective_to: null, discount_bps: 2000,
    }];
    const preview = previewPriceListApplication(
      [line], { item: 2000 }, "USD", fixedTier, "2026-11-06",
      percentRules, { item: 2500 },
    );
    expect(preview.lines[0]).toEqual({ ...line, unitPrice: "13.60" });
    expect(preview.lines[0]?.discount).toBe("3.00");
  });

  it("supports currencies with zero and three minor digits", () => {
    const line = [{ ...emptySalesLine(), productId: "item", unitPrice: "0" }];
    expect(previewPriceListApplication(line, { item: 1234 }, "JPY").lines[0]?.unitPrice)
      .toBe("1234");
    expect(previewPriceListApplication(line, { item: 1234 }, "KWD").lines[0]?.unitPrice)
      .toBe("1.234");
  });

  it("does not count an unchanged line as a price adjustment", () => {
    const first = { ...emptySalesLine(), productId: "a", unitPrice: "10.00" };
    const preview = previewPriceListApplication([first], { a: 1000 }, "USD");
    expect(preview).toMatchObject({ changed: 0, matched: 1 });
  });

  it("rejects unsafe or negative prices instead of rounding money", () => {
    expect(() => indexDraftPriceOverrides([
      { product_id: "a", unit_price_minor: -1 },
    ])).toThrow(/Invalid/);
    expect(() => indexDraftPriceOverrides([
      { product_id: "a", unit_price_minor: Number.MAX_SAFE_INTEGER + 1 },
    ])).toThrow(/Invalid/);
    expect(() => previewPriceListApplication(
      [{ ...emptySalesLine(), productId: "a" }],
      { a: 1.5 },
      "USD",
    )).toThrow(/Invalid/);
  });
});
