import { describe, expect, it } from "vitest";
import { normalizePayrollRunSearch } from "./run-search";

describe("Payroll runs native URL search", () => {
  it("trims padded search and drops blank input", () => {
    expect(normalizePayrollRunSearch("  November payroll  ")).toBe("November payroll");
    expect(normalizePayrollRunSearch("   ")).toBe("");
  });

  it("enforces length after normalization", () => {
    expect(normalizePayrollRunSearch("  " + "x".repeat(120) + "  ")).toBe("x".repeat(120));
    expect(normalizePayrollRunSearch("x".repeat(121))).toBe("");
  });

  it("rejects unsafe control and invisible characters", () => {
    for (const character of ["\n", "\t", "\u0000", "\u0085", "\u061c", "\u200b", "\u200f", "\u2028", "\u202e", "\u2060", "\u2066", "\ufeff"]) {
      expect(normalizePayrollRunSearch("run" + character)).toBe("");
    }
  });

  it("retains ordinary multilingual searches and rejects nonstring values", () => {
    expect(normalizePayrollRunSearch("  वेतन 🧾  ")).toBe("वेतन 🧾");
    expect(normalizePayrollRunSearch(["payroll"])).toBe("");
    expect(normalizePayrollRunSearch(null)).toBe("");
  });
});
