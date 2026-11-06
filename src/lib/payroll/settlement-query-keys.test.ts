import { describe, expect, it } from "vitest";
import { PAYROLL_SETTLEMENT_REFRESH_KEYS } from "./settlement-query-keys";

describe("Payroll settlement query refresh coverage", () => {
  it("refreshes the payment list and payment detail", () => {
    const prefixes = PAYROLL_SETTLEMENT_REFRESH_KEYS.map(([prefix]) => prefix);
    expect(prefixes).toContain("payroll-payments");
    expect(prefixes).toContain("payroll-payment-detail");
  });

  it("refreshes open payslip selectors after payment and reversal", () => {
    const prefixes = PAYROLL_SETTLEMENT_REFRESH_KEYS.map(([prefix]) => prefix);
    expect(prefixes).toContain("payroll-open-payslips");
    expect(prefixes).toContain("payroll-payslips");
    expect(prefixes).toContain("payroll-payslip");
  });

  it("refreshes summary and individual payroll run queries", () => {
    const prefixes = PAYROLL_SETTLEMENT_REFRESH_KEYS.map(([prefix]) => prefix);
    expect(prefixes).toContain("payroll-runs");
    expect(prefixes).toContain("payroll-run");
    expect(prefixes).toContain("payroll-run-journals");
  });

  it("covers all eight settlement-dependent cache families", () => {
    expect(PAYROLL_SETTLEMENT_REFRESH_KEYS).toHaveLength(8);
  });

  it("has no duplicate prefixes and is prefix-based across run filters", () => {
    const prefixes = PAYROLL_SETTLEMENT_REFRESH_KEYS.map(([prefix]) => prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(PAYROLL_SETTLEMENT_REFRESH_KEYS.every((key) => key.length === 1)).toBe(true);
  });
});
