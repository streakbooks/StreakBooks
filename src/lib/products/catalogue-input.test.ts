import { describe, expect, it } from "vitest";
import { productSkuProblem, validCataloguePrice } from "./catalogue-input";

describe("products catalogue input rules", () => {
  it("accepts exact positive and zero amounts in the company currency", () => {
    expect(validCataloguePrice("", "USD")).toBe(true);
    expect(validCataloguePrice("1,234.56", "USD")).toBe(true);
    expect(validCataloguePrice("1.001", "KWD")).toBe(true);
    expect(validCataloguePrice("55", "JPY")).toBe(true);
  });
  it("rejects negative, invalid, rounded or unsafe amounts", () => {
    expect(validCataloguePrice("-1.00", "USD")).toBe(false);
    expect(validCataloguePrice("1.001", "USD")).toBe(false);
    expect(validCataloguePrice("1.2", "JPY")).toBe(false);
    expect(validCataloguePrice("abc", "USD")).toBe(false);
    expect(validCataloguePrice("999999999999999999999", "USD")).toBe(false);
  });
  it("uses the same SKU format as CSV imports", () => {
    expect(productSkuProblem("")).toBeNull();
    expect(productSkuProblem("ABC_01-2.5")).toBeNull();
    expect(productSkuProblem("A B")).not.toBeNull();
    expect(productSkuProblem("_ABC")).not.toBeNull();
    expect(productSkuProblem("A".repeat(41))).not.toBeNull();
  });
});
