import { describe, expect, it } from "vitest";
import { exactTaxMinorUnits, safeTaxMinorNumber } from "./tax-minor-units";

describe("tax minor unit parsing", () => {
  it("retains exact posted amount from a bigint or decimal string", () => {
    expect(exactTaxMinorUnits("9007199254740993", "tax")).toBe(9007199254740993n);
    expect(exactTaxMinorUnits("-300", "tax")).toBe(-300n);
    expect(exactTaxMinorUnits(0, "tax")).toBe(0n);
    expect(safeTaxMinorNumber("-250", "tax")).toBe(-250);
  });
  it("rejects fractional or unsafe numbers without silent rounding", () => {
    for (const v of [3.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "2.5", "1e3", "", null]) {
      expect(() => exactTaxMinorUnits(v, "tax")).toThrow(/exact minor-unit/);
    }
  });
  it("refuses to display unsafe SQL bigint values as approximate numbers", () => {
    expect(() => safeTaxMinorNumber("9007199254740993", "tax")).toThrow(/too large/);
    expect(safeTaxMinorNumber(String(Number.MAX_SAFE_INTEGER), "tax")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
