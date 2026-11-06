import { describe, expect, it } from "vitest";
import { assertPayrollSettlementDateOnly } from "./payment-date";

describe("Payroll settlement calendar dates", () => {
  it("accepts valid date and leap day", () => {
    expect(() => assertPayrollSettlementDateOnly("2024-02-29", "Payment")).not.toThrow();
    expect(() => assertPayrollSettlementDateOnly("2026-11-06", "Reversal")).not.toThrow();
  });

  it("rejects impossible calendar days", () => {
    expect(() => assertPayrollSettlementDateOnly("2026-02-29", "Payment")).toThrow(/valid YYYY-MM-DD/);
    expect(() => assertPayrollSettlementDateOnly("2026-04-31", "Reversal")).toThrow(/valid YYYY-MM-DD/);
  });

  it("rejects invalid or non-ISO representations", () => {
    for (const date of ["0000-01-01", "2026-1-1", "2026-13-01", "", "2026-02-30", "2026-11-06T00:00:00Z"]) {
      expect(() => assertPayrollSettlementDateOnly(date, "Payment")).toThrow(/Payment date/);
    }
  });
});
