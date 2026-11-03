import { describe, expect, it } from "vitest";
import { assertCurrentPayablesDate, payableOutstandingInBase } from "./payables-integrity";

describe("payables reporting integrity", () => {
  it("only permits the company's current-date snapshot without historical allocations", () => {
    expect(() => assertCurrentPayablesDate("2026-11-03", "2026-11-03")).not.toThrow();
    expect(() => assertCurrentPayablesDate("2026-10-31", "2026-11-03")).toThrow(
      "dated payment and credit allocation history",
    );
    expect(() => assertCurrentPayablesDate("2026-11-04", "2026-11-03")).toThrow(
      "Choose 2026-11-03",
    );
    // The company-local date can differ from the host's UTC date.
    expect(() => assertCurrentPayablesDate("2026-11-04", "2026-11-04")).not.toThrow();
  });
  it("never silently mixes foreign outstanding amounts into the base-currency total", () => {
    expect(() => payableOutstandingInBase(10000n, "USD", "GBP", null)).toThrow(
      "no posted exchange rate",
    );
    expect(() => payableOutstandingInBase(10000n, "USD", "GBP", 0)).toThrow();
    expect(payableOutstandingInBase(10000n, "USD", "GBP", "2")).toBe(20000n);
    expect(payableOutstandingInBase(1n, "JPY", "GBP", "2")).toBe(200n);
    expect(payableOutstandingInBase(10000n, "GBP", "GBP", null)).toBe(10000n);
    expect(payableOutstandingInBase(0n, "USD", "GBP", null)).toBe(0n);
  });
});
