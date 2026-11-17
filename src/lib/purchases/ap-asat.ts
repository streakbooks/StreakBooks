/**
 * Accounts-payable "as at" maths. Pure integer minor units, no I/O.
 *
 * Outstanding at `asOf` is rebuilt from dated payment and credit allocations — never from the
 * bill's current paid/credited counters:
 *   outstanding = total − Σ allocations with effective date ≤ asOf and not reversed on/before asOf
 *
 * A bill is on the books at `asOf` when it is not draft, dated ≤ asOf, and not voided on/before
 * asOf. Legacy voids without a recorded void date are treated as never having been outstanding.
 *
 * Unapplied supplier payments and purchase credits appear as negative lines (credit balances).
 * This module is original LinkBooks logic aligned to the existing AR as-at contract — not a
 * port of any competitor report layout or source.
 */
import { ageBucket, type AgingBucket } from "@/lib/accounting/reporting";

export type AsAtBill = {
  id: string;
  contactId: string;
  contactName: string;
  number: string | null;
  currencyCode: string;
  billDate: string;
  dueDate: string;
  totalMinor: number;
  status: string;
  voidDate: string | null;
};

/** A supplier payment or purchase-credit allocation against a bill. */
export type AsAtApAllocation = {
  billId: string;
  amountMinor: number;
  /** Effective date (payment allocation date / credit application date). */
  effectiveDate: string;
  reversedOn: string | null;
};

export type AsAtSupplierPayment = {
  id: string;
  contactId: string;
  contactName: string;
  reference: string | null;
  currencyCode: string;
  paymentDate: string;
  amountMinor: number;
  status: string;
  voidDate: string | null;
  unallocatedMinor: number;
};

export type AsAtPurchaseCredit = {
  id: string;
  contactId: string;
  contactName: string;
  number: string | null;
  currencyCode: string;
  creditDate: string;
  totalMinor: number;
  status: string;
  voidDate: string | null;
  amountAllocatedMinor: number;
};

export function isApAllocationActiveAt(a: AsAtApAllocation, asOf: string): boolean {
  if (a.effectiveDate > asOf) return false;
  if (a.reversedOn && a.reversedOn <= asOf) return false;
  return true;
}

export function allocatedApAsAt(allocs: AsAtApAllocation[], asOf: string): number {
  return allocs.reduce((s, a) => (isApAllocationActiveAt(a, asOf) ? s + a.amountMinor : s), 0);
}

export function billIsOnBooksAt(bill: AsAtBill, asOf: string): boolean {
  if (bill.status === "draft") return false;
  if (bill.billDate > asOf) return false;
  if (bill.status === "void") {
    if (!bill.voidDate) return false;
    return bill.voidDate > asOf;
  }
  return true;
}

export function billOutstandingAsAt(
  bill: AsAtBill,
  allocs: AsAtApAllocation[],
  asOf: string,
): number {
  if (!billIsOnBooksAt(bill, asOf)) return 0;
  return Math.max(0, bill.totalMinor - allocatedApAsAt(allocs, asOf));
}

function paymentIsOnBooksAt(p: AsAtSupplierPayment, asOf: string): boolean {
  if (p.paymentDate > asOf) return false;
  if (p.status === "void") return Boolean(p.voidDate) && (p.voidDate as string) > asOf;
  return true;
}

/**
 * Unapplied cash at `asOf`: payment amount − allocations active at asOf − amount already refunded
 * or otherwise consumed. Consumption without a dated event is deducted in full (exact for today
 * and any date after the consumption).
 */
export function unappliedPaymentAsAt(
  p: AsAtSupplierPayment,
  allocs: AsAtApAllocation[],
  asOf: string,
): number {
  if (!paymentIsOnBooksAt(p, asOf)) return 0;
  const activeNow = allocs.reduce((s, a) => (a.reversedOn ? s : s + a.amountMinor), 0);
  const consumed =
    p.status === "void" ? 0 : Math.max(0, p.amountMinor - activeNow - p.unallocatedMinor);
  return Math.max(0, p.amountMinor - allocatedApAsAt(allocs, asOf) - consumed);
}

function creditIsOnBooksAt(c: AsAtPurchaseCredit, asOf: string): boolean {
  if (c.status === "draft") return false;
  if (c.creditDate > asOf) return false;
  if (c.status === "void") return Boolean(c.voidDate) && (c.voidDate as string) > asOf;
  return true;
}

export function unappliedPurchaseCreditAsAt(
  c: AsAtPurchaseCredit,
  allocs: AsAtApAllocation[],
  asOf: string,
): number {
  if (!creditIsOnBooksAt(c, asOf)) return 0;
  const activeNow = allocs.reduce((s, a) => (a.reversedOn ? s : s + a.amountMinor), 0);
  const consumed = c.status === "void" ? 0 : Math.max(0, c.amountAllocatedMinor - activeNow);
  return Math.max(0, c.totalMinor - allocatedApAsAt(allocs, asOf) - consumed);
}

export type ApAgedLine = {
  kind: "bill" | "payment" | "credit_note";
  id: string;
  reference: string | null;
  doc_date: string;
  due_date: string;
  /** Positive for bills, negative for unapplied payments / credits. */
  outstanding_minor: number;
  bucket: AgingBucket;
};

export type ApAgedRow = {
  contact_id: string;
  contact_name: string;
  currency_code: string;
  current: number;
  b_1_30: number;
  b_31_60: number;
  b_61_90: number;
  b_90_plus: number;
  unapplied: number;
  total: number;
  docs: ApAgedLine[];
};

export type AgedPayablesAsAt = {
  asOf: string;
  rows: ApAgedRow[];
  totalsByCurrency: Array<{
    currency_code: string;
    total: number;
    byBucket: Record<AgingBucket, number>;
    unapplied: number;
  }>;
};

function emptyBuckets(): Record<AgingBucket, number> {
  return { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
}

export function buildAgedPayablesAsAt(input: {
  asOf: string;
  bills: AsAtBill[];
  payments: AsAtSupplierPayment[];
  creditNotes: AsAtPurchaseCredit[];
  paymentAllocations: Array<AsAtApAllocation & { paymentId: string }>;
  creditAllocations: Array<AsAtApAllocation & { creditNoteId: string }>;
}): AgedPayablesAsAt {
  const { asOf } = input;
  const byBill = new Map<string, AsAtApAllocation[]>();
  const push = (m: Map<string, AsAtApAllocation[]>, key: string, a: AsAtApAllocation) => {
    const arr = m.get(key);
    if (arr) arr.push(a);
    else m.set(key, [a]);
  };
  const byPayment = new Map<string, AsAtApAllocation[]>();
  const byCredit = new Map<string, AsAtApAllocation[]>();
  for (const a of input.paymentAllocations) {
    push(byBill, a.billId, a);
    push(byPayment, a.paymentId, a);
  }
  for (const a of input.creditAllocations) {
    push(byBill, a.billId, a);
    push(byCredit, a.creditNoteId, a);
  }

  const rows = new Map<string, ApAgedRow>();
  const totals = new Map<
    string,
    { total: number; byBucket: Record<AgingBucket, number>; unapplied: number }
  >();

  const add = (
    contactId: string,
    contactName: string,
    currency: string,
    line: Omit<ApAgedLine, "bucket">,
    negative: boolean,
  ) => {
    const bucket = ageBucket(line.due_date, asOf);
    const key = `${contactId}|${currency}`;
    const row =
      rows.get(key) ??
      ({
        contact_id: contactId,
        contact_name: contactName,
        currency_code: currency,
        current: 0,
        b_1_30: 0,
        b_31_60: 0,
        b_61_90: 0,
        b_90_plus: 0,
        unapplied: 0,
        total: 0,
        docs: [],
      } as ApAgedRow);
    const amt = line.outstanding_minor;
    if (bucket === "current") row.current += amt;
    else if (bucket === "1_30") row.b_1_30 += amt;
    else if (bucket === "31_60") row.b_31_60 += amt;
    else if (bucket === "61_90") row.b_61_90 += amt;
    else row.b_90_plus += amt;
    row.total += amt;
    if (negative) row.unapplied += amt;
    row.docs.push({ ...line, bucket });
    rows.set(key, row);

    const t = totals.get(currency) ?? { total: 0, byBucket: emptyBuckets(), unapplied: 0 };
    t.total += amt;
    t.byBucket[bucket] += amt;
    if (negative) t.unapplied += amt;
    totals.set(currency, t);
  };

  for (const bill of input.bills) {
    const out = billOutstandingAsAt(bill, byBill.get(bill.id) ?? [], asOf);
    if (out <= 0) continue;
    add(
      bill.contactId,
      bill.contactName,
      bill.currencyCode,
      {
        kind: "bill",
        id: bill.id,
        reference: bill.number,
        doc_date: bill.billDate,
        due_date: bill.dueDate,
        outstanding_minor: out,
      },
      false,
    );
  }
  for (const p of input.payments) {
    const un = unappliedPaymentAsAt(p, byPayment.get(p.id) ?? [], asOf);
    if (un <= 0) continue;
    add(
      p.contactId,
      p.contactName,
      p.currencyCode,
      {
        kind: "payment",
        id: p.id,
        reference: p.reference ? `Payment ${p.reference}` : "Unapplied payment",
        doc_date: p.paymentDate,
        due_date: p.paymentDate,
        outstanding_minor: -un,
      },
      true,
    );
  }
  for (const c of input.creditNotes) {
    const un = unappliedPurchaseCreditAsAt(c, byCredit.get(c.id) ?? [], asOf);
    if (un <= 0) continue;
    add(
      c.contactId,
      c.contactName,
      c.currencyCode,
      {
        kind: "credit_note",
        id: c.id,
        reference: c.number ? `Credit ${c.number}` : "Unapplied supplier credit",
        doc_date: c.creditDate,
        due_date: c.creditDate,
        outstanding_minor: -un,
      },
      true,
    );
  }

  const out = [...rows.values()]
    .filter((r) => r.total !== 0 || r.docs.length > 0)
    .sort(
      (a, b) =>
        a.contact_name.localeCompare(b.contact_name) ||
        a.currency_code.localeCompare(b.currency_code),
    );
  for (const r of out) r.docs.sort((a, b) => a.doc_date.localeCompare(b.doc_date));
  return {
    asOf,
    rows: out,
    totalsByCurrency: [...totals.entries()]
      .map(([currency_code, t]) => ({ currency_code, ...t }))
      .sort((a, b) => a.currency_code.localeCompare(b.currency_code)),
  };
}
