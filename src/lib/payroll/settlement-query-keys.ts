/** The Payroll settlement UI has multiple independent TanStack Query caches.
 * A settlement or reversal must refresh the open-payslip selection, payment
 * detail, runs and lists, not merely the Payment list itself.
 *
 * Prefixes intentionally match every run-filtered view and active organisation
 * so a company switch does not leave a stale payment or payslip cache behind.
 */
export const PAYROLL_SETTLEMENT_REFRESH_KEYS = [
  ["payroll-payments"],
  ["payroll-payment-detail"],
  ["payroll-payslips"],
  ["payroll-open-payslips"],
  ["payroll-payslip"],
  ["payroll-runs"],
  ["payroll-run"],
  ["payroll-run-journals"],
] as const;
