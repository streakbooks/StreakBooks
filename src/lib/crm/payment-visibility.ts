import { invoiceIsOverdue, invoiceOutstandingMinor } from "@/lib/sales/invoice-list-display";

export type CrmDealInvoiceRow = {
  opportunityId: string;
  opportunityNumber: string;
  opportunityName: string;
  quoteId: string;
  quoteNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  currencyCode: string;
  totalMinor: number;
  outstandingMinor: number;
  dueDate: string | null;
  isOverdue: boolean;
};

export function buildCrmDealInvoiceRow(input: {
  opportunityId: string;
  opportunityNumber: string;
  opportunityName: string;
  quoteId: string;
  quoteNumber?: string | null;
  invoice?: {
    id: string;
    invoice_number: string;
    status: string;
    currency_code: string;
    total_minor: number;
    amount_paid_minor: number;
    amount_credited_minor: number;
    due_date: string;
  } | null;
  today: string;
}): CrmDealInvoiceRow {
  const invoice = input.invoice ?? null;
  if (!invoice) {
    return {
      opportunityId: input.opportunityId,
      opportunityNumber: input.opportunityNumber,
      opportunityName: input.opportunityName,
      quoteId: input.quoteId,
      quoteNumber: input.quoteNumber ?? null,
      invoiceId: null,
      invoiceNumber: null,
      invoiceStatus: null,
      currencyCode: "USD",
      totalMinor: 0,
      outstandingMinor: 0,
      dueDate: null,
      isOverdue: false,
    };
  }
  const outstanding = invoiceOutstandingMinor(invoice);
  return {
    opportunityId: input.opportunityId,
    opportunityNumber: input.opportunityNumber,
    opportunityName: input.opportunityName,
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber ?? null,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceStatus: invoice.status,
    currencyCode: invoice.currency_code || "USD",
    totalMinor: invoice.total_minor,
    outstandingMinor: outstanding,
    dueDate: invoice.due_date,
    isOverdue: invoiceIsOverdue(invoice, input.today),
  };
}
