import { describe, expect, it } from "vitest";
import {
  assertMatchingCatalogueCurrency,
  validateCatalogueDescription,
  validateCatalogueName,
  validateCataloguePriceMinor,
} from "./catalogue-masterdata-rules";

describe("product category and price list inputs", () => {
  it("normalises names and rejects blank or oversized names", () => {
    expect(validateCatalogueName("  Consulting  ")).toBe("Consulting");
    expect(() => validateCatalogueName("  ")).toThrow(/1–100/);
    expect(() => validateCatalogueName("x".repeat(101))).toThrow(/1–100/);
  });
  it("limits descriptions and preserves blank defaults", () => {
    expect(validateCatalogueDescription()).toBe("");
    expect(validateCatalogueDescription("  Wholesale  ")).toBe("Wholesale");
    expect(() => validateCatalogueDescription("x".repeat(501))).toThrow(/500/);
  });
  it("allows exact zero and safe integer prices, but rejects rounding and negatives", () => {
    expect(validateCataloguePriceMinor(0)).toBe(0);
    expect(validateCataloguePriceMinor(123456)).toBe(123456);
    for (const value of [-1, 1.01, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateCataloguePriceMinor(value)).toThrow(/safe/);
    }
  });
  it("rejects price lists denominated in another currency", () => {
    expect(() => assertMatchingCatalogueCurrency("USD", "USD")).not.toThrow();
    expect(() => assertMatchingCatalogueCurrency("USD", "INR")).toThrow(/different currency/);
  });
});
