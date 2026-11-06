import type { PayrollBankExportRow } from "@/lib/payroll/payments.functions";

/** Neutralise spreadsheet-formula injection in every free-text bank CSV
 * field, including formulas hidden after whitespace or control characters.
 * The amount_minor column is ledger-derived and remains an unchanged decimal.
 */
function csvEscape(value: string): string {
  const formulaLike = /^[\\s\\u200B-\\u200F\\uFEFF]*[=+\\-@]/u.test(value);
  const startsWithControl = /^[\\t\\r\\n]/u.test(value);
  const safe = formulaLike || startsWithControl ? `'${value}` : value;
  if (/[",\\n\\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
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
