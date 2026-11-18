import { describe, expect, it } from "vitest";
import {
  isValidTaxDate,
  percentToTaxBasisPoints,
  isValidTaxBasisPoints,
  validateTaxReturnPeriod,
} from "./tax-input-validation";

describe("tax input validation", () => {
  it("accepts real ISO dates, including leap days", () => {
    expect(isValidTaxDate("2024-02-29")).toBe(true);
    expect(isValidTaxDate("2026-11-06")).toBe(true);
    expect(isValidTaxDate("2026-02-29")).toBe(false);
    expect(isValidTaxDate("2026-04-31")).toBe(false);
    expect(isValidTaxDate("2026-13-01")).toBe(false);
    expect(isValidTaxDate("2026-01-00")).toBe(false);
    expect(isValidTaxDate("06/11/2026")).toBe(false);
  });

  it("parses exact percent precision without silent rounding", () => {
    expect(percentToTaxBasisPoints("0")).toBe(0);
    expect(percentToTaxBasisPoints("1.2")).toBe(120);
    expect(percentToTaxBasisPoints(" 20.25 ")).toBe(2025);
    expect(percentToTaxBasisPoints("100.00")).toBe(10000);
    for (const v of ["20.005", "100.01", "-1", "", "1e2", "NaN", "1."]) {
      expect(percentToTaxBasisPoints(v)).toBeNaN();
    }
  });

  it("rejects fractional, non-finite and out-of-range basis points", () => {
    expect(isValidTaxBasisPoints(0)).toBe(true);
    expect(isValidTaxBasisPoints(10000)).toBe(true);
    for (const value of [20.5, NaN, Infinity, -1, 10001, "20"]) {
      expect(isValidTaxBasisPoints(value)).toBe(false);
    }
  });

  it("validates period order and basis, defaults to accrual only when omitted", () => {
    expect(
      validateTaxReturnPeriod({
        periodStart: "2024-02-01",
        periodEnd: "2024-02-29",
      }),
    ).toEqual({ periodStart: "2024-02-01", periodEnd: "2024-02-29", basis: "accrual" });
    expect(
      validateTaxReturnPeriod({
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        basis: "cash",
      }).basis,
    ).toBe("cash");
    expect(() =>
      validateTaxReturnPeriod({
        periodStart: "2026-02-31",
        periodEnd: "2026-03-31",
      }),
    ).toThrow(/real calendar date/);
    expect(() =>
      validateTaxReturnPeriod({
        periodStart: "2026-10-01",
        periodEnd: "2026-09-30",
      }),
    ).toThrow(/cannot end before/);
    expect(() =>
      validateTaxReturnPeriod({
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        basis: "unknown",
      }),
    ).toThrow(/cash or accrual/);
  });
});
