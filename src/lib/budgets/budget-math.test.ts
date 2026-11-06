import { describe, expect, it } from "vitest";
import {
  applyUpliftBps,
  computeVariance,
  naturalActual,
  spreadEvenly,
  sumMinorNumbers,
} from "./budget-math";

describe("Budgets precision-safe minor-unit arithmetic", () => {
  it("sums ordinary minor amounts exactly", () => {
    expect(sumMinorNumbers([125, 75, -50])).toBe(150);
    expect(sumMinorNumbers([])).toBe(0);
  });

  it("does not silently round sums of individually safe large integers", () => {
    expect(() => sumMinorNumbers([
      Number.MAX_SAFE_INTEGER, 1,
    ])).toThrow(/safe minor-unit/);
    expect(sumMinorNumbers([Number.MAX_SAFE_INTEGER, -1])).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it("rejects malformed, fractional and unsafe inputs before aggregation", () => {
    for (const amount of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => sumMinorNumbers([amount])).toThrow(/safe integer/);
    }
  });

  it("handles natural income and expense debit/credit signs", () => {
    expect(naturalActual("income", 150, 1_000)).toBe(850);
    expect(naturalActual("expense", 1_000, 150)).toBe(850);
    expect(naturalActual("income", 1_000, 150)).toBe(-850);
  });

  it("rejects unsafe natural actual subtraction", () => {
    expect(() => naturalActual("income", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))
      .toThrow(/safe minor-unit/);
    expect(() => naturalActual("expense", 1.25, 0)).toThrow(/safe integer/);
  });

  it("marks expense increases unfavourable and income increases favourable", () => {
    expect(computeVariance("income", 1_000, 1_500)).toMatchObject({
      varianceMinor: 500, status: "favourable", variancePctBps: 5000,
    });
    expect(computeVariance("expense", 1_000, 1_500)).toMatchObject({
      varianceMinor: -500, status: "unfavourable", variancePctBps: -5000,
    });
  });

  it("does not invent a percentage when baseline is zero", () => {
    expect(computeVariance("income", 0, 250).variancePctBps).toBeNull();
  });

  it("rejects unsafe variance or percentage rather than truncating", () => {
    expect(() => computeVariance("income", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))
      .toThrow(/safe minor-unit/);
    expect(() => computeVariance("income", 1, 1_000_000_000_000))
      .toThrow(/safe minor-unit/);
  });

  it("applies percentage uplift with integer rounding and rejects overflow", () => {
    expect(applyUpliftBps(101, 500)).toBe(106);
    expect(applyUpliftBps(-101, 500)).toBe(-106);
    expect(() => applyUpliftBps(Number.MAX_SAFE_INTEGER, 10_000))
      .toThrow(/safe minor-unit/);
    expect(() => applyUpliftBps(100, Number.MAX_SAFE_INTEGER + 1))
      .toThrow(/safe whole basis points/);
  });

  it("spreads an annual total without losing rounding remainders", () => {
    const monthly = spreadEvenly(101, 12);
    expect(monthly).toHaveLength(12);
    expect(sumMinorNumbers(monthly)).toBe(101);
    expect(spreadEvenly(-101, 12).reduce((a, b) => a + b, 0)).toBe(-101);
  });

  it("never creates a negative month from a small positive annual budget", () => {
    expect(spreadEvenly(7, 12)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]);
    expect(spreadEvenly(1, 12)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(spreadEvenly(0, 12)).toEqual(Array(12).fill(0));
  });

  it("never creates a positive month from a small negative annual total", () => {
    expect(spreadEvenly(-7, 12)).toEqual([0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1]);
    expect(spreadEvenly(-1, 12)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1]);
  });

  it("preserves totals and keeps monthly differences within one minor unit", () => {
    for (const annual of [
      -101, -13, -12, -11, -7, -1, 0, 1, 7, 11, 12, 13, 101,
      Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
    ]) {
      const monthly = spreadEvenly(annual, 12);
      expect(sumMinorNumbers(monthly)).toBe(annual);
      expect(Math.max(...monthly) - Math.min(...monthly)).toBeLessThanOrEqual(1);
      expect(monthly.every((m) => annual >= 0 ? m >= 0 : m <= 0)).toBe(true);
    }
  });

  it("handles single-month budgets and nonstandard valid period counts", () => {
    expect(spreadEvenly(7, 1)).toEqual([7]);
    expect(spreadEvenly(7, 2)).toEqual([3, 4]);
    expect(spreadEvenly(-7, 2)).toEqual([-3, -4]);
    expect(sumMinorNumbers(spreadEvenly(17, 17))).toBe(17);
  });

  it("does not round extremely large supported annual totals", () => {
    const months = spreadEvenly(Number.MAX_SAFE_INTEGER, 12);
    expect(sumMinorNumbers(months)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects invalid month counts without attempting unsafe allocations", () => {
    expect(() => spreadEvenly(100, 1.5)).toThrow(/Month count/);
    expect(() => spreadEvenly(100, 1201)).toThrow(/Month count/);
    expect(spreadEvenly(100, 0)).toEqual([]);
  });
});
