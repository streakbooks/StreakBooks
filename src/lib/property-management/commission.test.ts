import { describe, expect, it } from "vitest";
import {
  computeCommissionMinor,
  statementTotalsBalance,
} from "@/lib/property-management/ops-types";

describe("computeCommissionMinor", () => {
  it("applies percent of gross with rounding", () => {
    expect(
      computeCommissionMinor({
        feeType: "percent_gross",
        ratePct: 20,
        fixedMinor: null,
        minimumMinor: null,
        baseAmountMinor: 10_055,
      }),
    ).toBe(2011);
  });

  it("honours fixed fee and minimum floor", () => {
    expect(
      computeCommissionMinor({
        feeType: "fixed_monthly",
        ratePct: null,
        fixedMinor: 5000,
        minimumMinor: 7500,
        baseAmountMinor: 100,
      }),
    ).toBe(7500);
  });
});

describe("statementTotalsBalance", () => {
  it("reconciles opening to closing", () => {
    expect(
      statementTotalsBalance({
        openingBalanceMinor: 1000,
        incomeMinor: 5000,
        expensesMinor: 1500,
        feesMinor: 500,
        contributionsMinor: 0,
        distributionsMinor: 2000,
        closingBalanceMinor: 2000,
      }),
    ).toBe(true);
  });

  it("rejects unbalanced statements", () => {
    expect(
      statementTotalsBalance({
        openingBalanceMinor: 0,
        incomeMinor: 100,
        expensesMinor: 0,
        feesMinor: 0,
        contributionsMinor: 0,
        distributionsMinor: 0,
        closingBalanceMinor: 50,
      }),
    ).toBe(false);
  });
});
