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
