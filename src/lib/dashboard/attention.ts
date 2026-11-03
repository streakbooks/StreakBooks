import { billOutstanding } from "@/lib/purchases/line-math";
import { invoiceOutstanding } from "@/lib/sales/line-helpers";

/**
 * Reuses the posted-document population and established account-math helpers already
 * used by the dashboard ageing reports. No mixed-currency sums or invented financial data.
 */
export type OpenAttentionDocument = {
  id: string;
  due_date: string;
  currency_code: string;
  total_minor: number;
  amount_paid_minor: number;
  amount_credited_minor: number;
  posted_journal_id: string | null;
  invoice_number?: string | null;
  bill_number?: string | null;
  supplier_invoice_number?: string | null;
  contacts?: { name: string } | null;
};

export type DocumentAttentionItem = {
  id: string;
  kind: "invoice" | "bill";
  reference: string;
  contact: string | null;
  dueDate: string;
  daysUntilDue: number;
  currency: string;
  outstandingMinor: number;
};

export type DocumentAttention = {
  overdueInvoices: number;
  overdueBills: number;
  dueSoonInvoices: number;
  dueSoonBills: number;
  items: DocumentAttentionItem[];
};

const MS_PER_DAY = 86_400_000;

function dueDays(due: string, asOf: string): number | null {
  const a = Date.parse(asOf + "T00:00:00Z");
  const b = Date.parse(due + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

export function buildDocumentAttention(
  invoices: readonly OpenAttentionDocument[],
  bills: readonly OpenAttentionDocument[],
  asOf: string,
  windowDays = 7,
  limit = 10,
): DocumentAttention {
  const all: DocumentAttentionItem[] = [];
  const counters: DocumentAttention = {
    overdueInvoices: 0,
    overdueBills: 0,
    dueSoonInvoices: 0,
    dueSoonBills: 0,
    items: [],
  };

  function add(rows: readonly OpenAttentionDocument[], kind: "invoice" | "bill") {
    for (const row of rows) {
      if (!row.posted_journal_id) continue;
      const outstanding = (kind === "invoice" ? invoiceOutstanding : billOutstanding)({
        total_minor: row.total_minor,
        amount_paid_minor: row.amount_paid_minor,
        amount_credited_minor: row.amount_credited_minor,
      });
      if (outstanding <= 0n) continue;
      const days = dueDays(row.due_date, asOf);
      if (days === null) continue;
      if (days < 0) {
        if (kind === "invoice") counters.overdueInvoices += 1;
        else counters.overdueBills += 1;
      } else if (days <= windowDays) {
        if (kind === "invoice") counters.dueSoonInvoices += 1;
        else counters.dueSoonBills += 1;
      } else continue;

      all.push({
        id: row.id,
        kind,
        reference:
          (kind === "invoice"
            ? row.invoice_number
            : row.supplier_invoice_number || row.bill_number) || row.id.slice(0, 8),
        contact: row.contacts?.name ?? null,
        dueDate: row.due_date,
        daysUntilDue: days,
        currency: row.currency_code,
        outstandingMinor: Number(outstanding),
      });
    }
  }

  add(invoices, "invoice");
  add(bills, "bill");
  all.sort(
    (a, b) =>
      a.daysUntilDue - b.daysUntilDue || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
  counters.items = all.slice(0, Math.max(0, Math.min(30, limit)));
  return counters;
}

export type BankAttentionItem = {
  id: string;
  description: string;
  bankAccount: string;
  txnDate: string;
  amountMinor: number;
  currency: string;
};

/** Top-level actionable queue categories; zero-valued categories remain available as clear states. */
export function attentionPriority(
  count: number,
  type: "overdue" | "approval" | "bank" | "due" | "draft",
): "urgent" | "review" | "clear" {
  if (count <= 0) return "clear";
  return type === "overdue" ? "urgent" : "review";
}
