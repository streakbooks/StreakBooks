import { describe, expect, it } from "vitest";
import { payrollClearingCurrencyMismatch } from "./clearing-currency";

describe("Payroll clearing currency compatibility", () => {
  it("accepts matching GL and linked bank currency", () => {
    expect(payrollClearingCurrencyMismatch("gbp", "GBP", ["GBP"])).toBeNull();
  });
  it("permits a base-currency GL account without explicit override", () => {
    expect(payrollClearingCurrencyMismatch("GBP", null)).toBeNull();
  });
  it("rejects a foreign GL account", () => {
    expect(payrollClearingCurrencyMismatch("GBP", "USD")).toMatch(/clearing account currency/);
  });
  it("rejects an incompatible linked bank even with NULL GL override", () => {
    expect(payrollClearingCurrencyMismatch("GBP", null, ["GBP", "USD"]))
      .toMatch(/linked bank account/);
  });
  it("rejects a blank or malformed bank currency instead of assuming base", () => {
    expect(payrollClearingCurrencyMismatch("GBP", null, [""])).toMatch(/linked bank account/);
    expect(payrollClearingCurrencyMismatch("XX", null)).toMatch(/valid payroll payment currency/);
  });
});
