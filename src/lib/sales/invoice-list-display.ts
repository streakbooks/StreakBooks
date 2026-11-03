/** Shared invoice-list presentation rules. Amounts stay in document minor units. */
export type InvoiceBalanceFields = {
  status: string;
  total_minor: number;
  amount_paid_minor: number;
  amount_credited_minor: number;
  due_date: string;
};

export function invoiceOutstandingMinor(invoice: InvoiceBalanceFields): number {
  return invoice.status === "authorised" || invoice.status === "partly_paid"
    ? invoice.total_minor - invoice.amount_paid_minor - invoice.amount_credited_minor
    : 0;
}

export function invoiceIsOverdue(invoice: InvoiceBalanceFields, today: string): boolean {
  return invoiceOutstandingMinor(invoice) > 0 && Boolean(today) && invoice.due_date < today;
}
