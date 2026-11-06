import type { PayrollBankExportRow } from "@/lib/payroll/payments.functions";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build a generic (non bank-specific) CSV for manual bank upload review. */
export function buildGenericPayrollBankCsv(rows: PayrollBankExportRow[]): string {
  const headers = [
    "run_number",
    "payslip_number",
    "employee_number",
    "employee_name",
    "payment_date",
    "currency",
    "amount_minor",
    "account_name",
    "bank_name",
    "account_number",
    "sort_code",
    "iban",
    "bic",
    "reference",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.run_number,
        row.payslip_number,
        row.employee_number,
        row.employee_name,
        row.payment_date,
        row.currency,
        String(row.amount_minor),
        row.account_name ?? "",
        row.bank_name ?? "",
        row.account_number ?? "",
        row.sort_code ?? "",
        row.iban ?? "",
        row.bic ?? "",
        row.reference,
      ]
        .map((v) => csvEscape(v))
        .join(","),
    );
  }
  return lines.join("\n");
}
