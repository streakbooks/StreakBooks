import { describe, expect, it } from "vitest";
import { normaliseBulkPriceChange } from "./bulk-price-rules";

describe("catalogue bulk price input", () => {
  const input = {
    productIds: ["aaa", "bbb", "aaa"],
    field: "sales_price_minor" as const,
    valueMinor: 10025,
  };
  it("preserves exact non-negative amounts and deduplicates selection", () => {
    expect(normaliseBulkPriceChange(input)).toEqual({
      field: "sales_price_minor",
      valueMinor: 10025,
      productIds: ["aaa", "bbb"],
    });
    expect(normaliseBulkPriceChange({ ...input, valueMinor: 0 }).valueMinor).toBe(0);
  });
  it("rejects missing or over-limit selection", () => {
    expect(() => normaliseBulkPriceChange({ ...input, productIds: [] })).toThrow(/1 and 100/);
    expect(() => normaliseBulkPriceChange({ ...input, productIds: Array(101).fill("id") })).toThrow(
      /1 and 100/,
    );
    expect(() => normaliseBulkPriceChange({ ...input, productIds: [""] })).toThrow(/selection/);
  });
  it("rejects negative, fractional, unsafe or invalid prices", () => {
    for (const valueMinor of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
      expect(() => normaliseBulkPriceChange({ ...input, valueMinor })).toThrow(/safe integer/);
    }
  });
  it("rejects unknown price fields", () => {
    expect(() =>
      normaliseBulkPriceChange({
        ...input,
        field: "inventory_value" as "sales_price_minor",
      }),
    ).toThrow(/price field/);
  });
});
