import type { PayrollRunStatus } from "@/lib/payroll/types";

/**
 * Payroll report monetary scope.
 *
 * Includes approved runs (finalised pay, may not yet be posted) and posted lifecycle runs.
 * Excludes draft, calculated, reviewed (not approved), and void.
 *
 * Totals on run headers and included run employees reconcile with these figures.
 * Approved-but-not-posted runs appear in operational reports but not in journal reconciliation.
 */
export const PAYROLL_REPORT_MONETARY_STATUSES: readonly PayrollRunStatus[] = [
  "approved",
  "posted",
  "paid",
  "complete",
] as const;

/** Runs with ledger accrual journals (posted payroll). */
export const PAYROLL_REPORT_POSTED_STATUSES: readonly PayrollRunStatus[] = [
  "posted",
  "paid",
  "complete",
] as const;

export const PAYROLL_REPORT_STATUS_FOOTNOTE =
  "Amounts include payroll runs in status approved, posted, paid, or complete (period end within the selected dates). Void and pre-approval runs are excluded.";

export const PAYROLL_REPORT_JOURNAL_FOOTNOTE =
  "Journal reconciliation includes only posted, paid, or complete runs with an accrual journal.";
