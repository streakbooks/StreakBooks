import { describe, expect, it } from "vitest";
import { prepareBudgetImportCsv } from "./budget-import";

const header = ["Account code", "Account name", ...Array.from({ length: 12 }, (_, i) => `Month ${i+1}`)].join(",");
const line = (code: string, values: string[] = Array.from({length:12}, () => "0.00")) =>
  [code, "Expenses", ...values].join(",");

describe("budget CSV import preflight", () => {
  it("maps twelve fiscal months to integer minor units without posting", () => {
    const values = ["123.45", "-10.00", ...Array.from({ length: 10 }, () => "0.00")];
    const rows = prepareBudgetImportCsv(`${header}\n${line("6000", values)}`, "USD");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.months).toEqual([12345, -1000, ...Array.from({length:10}, () => 0)]);
  });
  it("rejects case-only duplicate account codes before writes", () => {
    expect(() => prepareBudgetImportCsv(`${header}\n${line("Sales")}\n${line("sales")}`, "USD"))
      .toThrow(/duplicate budget account/i);
  });
  it("rejects fractional minor units instead of rounding financial projections", () => {
    const values = ["1.001", ...Array.from({length:11}, () => "0.00")];
    expect(() => prepareBudgetImportCsv(`${header}\n${line("6000",values)}`, "USD"))
      .toThrow(/precision/);
  });
  it("rejects missing required columns, dangerous amounts, and empty rows", () => {
    expect(() => prepareBudgetImportCsv("Account code\n6000", "USD")).toThrow(/required column/i);
    expect(() => prepareBudgetImportCsv(header, "USD")).toThrow(/no budget rows/i);
    expect(() => prepareBudgetImportCsv(`${header}\n${line("6000", ["99999999999999999999", ...Array.from({length:11}, () => "0.00")])}`, "USD"))
      .toThrow(/safe integer/i);
  });
  it("rejects excessive CSV files before writes", () => {
    expect(() => prepareBudgetImportCsv("x".repeat(5 * 1024 * 1024 + 1), "USD"))
      .toThrow(/5 MB/);
  });
  it("accepts JPY zero-decimal budgets without fractional values", () => {
    expect(prepareBudgetImportCsv(`${header}\n${line("6000",Array.from({length:12}, () => "250"))}`, "JPY")[0]!.months[0]).toBe(250);
    expect(() => prepareBudgetImportCsv(`${header}\n${line("6000",Array.from({length:12}, () => "250.00"))}`, "JPY")).toThrow(/precision/);
  });
});
