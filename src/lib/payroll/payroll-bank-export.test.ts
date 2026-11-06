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
});
