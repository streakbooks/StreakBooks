/**
 * List-card presentation only. Never change or persist an accounting status.
 * The server-authorised bill row provides the due/remaining-balance facts.
 */
export function billCardDisplayStatus(bill: {
  status: string;
  days_overdue: number;
  balance_due_minor: number;
}): string {
  const openForPayment =
    bill.status === "authorised" ||
    bill.status === "partly_paid" ||
    bill.status === "partially_paid" ||
    bill.status === "awaiting_payment";
  return openForPayment &&
    Number.isFinite(bill.days_overdue) &&
    bill.days_overdue > 0 &&
    Number.isFinite(bill.balance_due_minor) &&
    bill.balance_due_minor > 0
    ? "overdue"
    : bill.status;
}
