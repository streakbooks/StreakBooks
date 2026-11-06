/** Plain-decimal, per-currency operational payslip export.
 * No grand total: payroll runs can have different currencies.
 */
import { csvMoney } from "@/lib/reports/csv";
import { toCsv } from "@/lib/sales/csv";
import type { PayrollPayslipRow, PayrollPayslipsListPage } from "@/lib/payroll/types";

export type PayrollPayslipListItem = PayrollPayslipsListPage["payslips"][number];

/** Shared by screen and CSV so a partially paid payslip cannot render two balances. */
export function payslipNetBalances(
  payslip: Pick<PayrollPayslipRow, "snapshot" | "amount_paid_minor">,
): { netMinor: number; paidMinor: number; outstandingMinor: number } {
  const netMinor = payslip.snapshot.totals?.netPayMinor ?? 0;
  const paidMinor = payslip.amount_paid_minor;
  return {
    netMinor,
    paidMinor,
    outstandingMinor: Math.max(0, netMinor - paidMinor),
  };
}

export const PAYSLIP_EXPORT_HEADERS = [
  "Payslip",
  "Employee ID",
  "Employee name",
  "Run",
  "Period start",
  "Period end",
  "Issued",
  "Payment status",
  "Currency",
  "Gross earnings",
  "Employee deductions",
  "Net pay",
  "Paid",
  "Outstanding",
] as const;

/** Export exactly the rows supplied (already filtered/sorted in the screen). */
export function payrollPayslipsToCsv(rows: readonly PayrollPayslipListItem[]): string {
  return toCsv(
    [...PAYSLIP_EXPORT_HEADERS],
    rows.map(({ payslip, employee, run }) => {
      const { netMinor, paidMinor, outstandingMinor } = payslipNetBalances(payslip);
      const currency = run.currency;
      return [
        payslip.payslip_number,
        employee.employee_number,
        `${employee.first_name} ${employee.last_name}`.trim(),
        run.run_number,
        run.period_start,
        run.period_end,
        payslip.issued_at,
        payslip.payment_status,
        currency,
        csvMoney(payslip.snapshot.totals?.grossEarningsMinor ?? 0, currency),
        csvMoney(payslip.snapshot.totals?.employeeDeductionsMinor ?? 0, currency),
        csvMoney(netMinor, currency),
        csvMoney(paidMinor, currency),
        csvMoney(outstandingMinor, currency),
      ];
    }),
  );
}
