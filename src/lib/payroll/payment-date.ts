import { isValidPayrollDateOnly } from "@/lib/payroll/calendar-date";

/** Payment and reversal dates must match a real local calendar date, not
 * merely the YYYY-MM-DD shape. PostgreSQL is the final database guard.
 */
export function assertPayrollSettlementDateOnly(
  date: string,
  label: "Payment" | "Reversal",
): void {
  if (!isValidPayrollDateOnly(date)) {
    throw new Error(`${label} date must be a valid YYYY-MM-DD calendar date.`);
  }
}
