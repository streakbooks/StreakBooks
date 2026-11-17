import { describe, expect, it } from "vitest";
import { buildGenericPayrollBankCsv } from "@/lib/payroll/payroll-bank-export";
import type { PayrollBankExportRow } from "@/lib/payroll/payments.functions";

describe("buildGenericPayrollBankCsv", () => {
  it("escapes commas and quotes in employee names", () => {
    const rows: PayrollBankExportRow[] = [
      {
        run_number: "RUN-1",
        payslip_number: "PS-1",
        employee_number: "E1",
        employee_name: 'Pat "Payee", Jr.',
        payment_date: "2026-02-05",
        currency: "GBP",
        amount_minor: 10_000,
        account_name: null,
        bank_name: null,
        account_number: null,
        sort_code: null,
        iban: null,
        bic: null,
        reference: "PS-1",
      },
    ];
    const csv = buildGenericPayrollBankCsv(rows);
    expect(csv.split("\n")[1]).toContain('"Pat ""Payee"", Jr."');
  });
  it("neutralises formula-like names and references without changing amounts", () => {
    const row: PayrollBankExportRow = {
      run_number: "R-1",
      payslip_number: "P-1",
      employee_number: "EMP-1",
      employee_name: '=HYPERLINK("https://example.invalid","click")',
      payment_date: "2026-11-06",
      currency: "GBP",
      amount_minor: 12_345,
      account_name: null,
      bank_name: null,
      account_number: null,
      sort_code: null,
      iban: null,
      bic: null,
      reference: "@SUM(A1:A5)",
    };
    const csv = buildGenericPayrollBankCsv([row]);
    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"",""click"")"`);
    expect(csv).toContain("'@SUM(A1:A5)");
    expect(csv).toContain(",12345,");
  });

  it("protects formulas hidden after whitespace and control characters", () => {
    const row: PayrollBankExportRow = {
      run_number: "RUN-01",
      payslip_number: "PS-1",
      employee_number: "EMP-01",
      employee_name: "  =2+2",
      payment_date: "2026-11-06",
      currency: "GBP",
      amount_minor: 100,
      account_name: "\t+SUM(A1)",
      bank_name: "\r-5+5",
      account_number: "+1234567",
      sort_code: "123456",
      iban: "GB12ABCD",
      bic: "BIC123",
      reference: "\uFEFF@cmd",
    };
    const csv = buildGenericPayrollBankCsv([row]);
    expect(csv).toContain("'  =2+2");
    expect(csv).toContain("'\t+SUM(A1)");
    expect(csv).toContain("'\r-5+5");
    expect(csv).toContain("'+1234567");
    expect(csv).toContain("'\uFEFF@cmd");
    expect(csv).toContain(",123456,");
  });

  it("does not alter safe account details or headers", () => {
    const csv = buildGenericPayrollBankCsv([
      {
        run_number: "RUN-1",
        payslip_number: "PS-1",
        employee_number: "EMP-1",
        employee_name: "Ada Lovelace",
        payment_date: "2026-11-06",
        currency: "GBP",
        amount_minor: 1000,
        account_name: "Ada",
        bank_name: "National Bank",
        account_number: "000123",
        sort_code: "010203",
        iban: "GB123",
        bic: "ABCGB",
        reference: "Payroll November",
      },
    ]);
    expect(csv.split("\n")[0]).toContain("amount_minor");
    expect(csv).toContain(
      ",Ada Lovelace,2026-11-06,GBP,1000,Ada,National Bank,000123,010203,GB123,ABCGB,Payroll November",
    );
  });
});
