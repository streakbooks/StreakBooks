/**
 * Supplier statement builder (AP / P-24).
 * Reuses the AR statement engine with purchase nouns — opening balance before `from`,
 * activity in [from, to], currency grouping, and void lines on recorded void dates.
 */

import {
  buildCustomerStatement,
  type StatementCurrency,
  type StatementDoc,
  type StatementLine,
} from "@/lib/sales/statement";

export type SupplierStatementDoc = {
  kind: "bill" | "payment" | "credit_note";
  id: string;
  date: string;
  currencyCode: string;
  amountMinor: number;
  reference: string | null;
  status: string;
  voidDate: string | null;
  dueDate?: string | null;
};

export type SupplierStatementLine = Omit<StatementLine, "type"> & {
  type: "bill" | "payment" | "credit_note" | "void";
};

export type SupplierStatementCurrency = Omit<StatementCurrency, "lines"> & {
  lines: SupplierStatementLine[];
};

const SUPPLIER_NOUNS = {
  invoice: "Bill",
  receipt: "Payment",
  credit_note: "Credit note",
} as const;

function toArDoc(doc: SupplierStatementDoc): StatementDoc {
  return {
    kind: doc.kind === "bill" ? "invoice" : doc.kind === "payment" ? "receipt" : "credit_note",
    id: doc.id,
    date: doc.date,
    currencyCode: doc.currencyCode,
    amountMinor: doc.amountMinor,
    reference: doc.reference,
    status: doc.status,
    voidDate: doc.voidDate,
    dueDate: doc.dueDate ?? null,
  };
}

function remapLineType(type: StatementLine["type"]): SupplierStatementLine["type"] {
  if (type === "invoice") return "bill";
  if (type === "receipt") return "payment";
  if (type === "credit_note") return "credit_note";
  return "void";
}

/** Fail closed when the period is inverted. */
export function assertSupplierStatementRange(from: string | null, to: string | null): void {
  if (from && to && from > to) {
    throw new Error("Statement From date cannot be after the To date");
  }
}

/**
 * Build per-currency supplier statements. Positive balance = amount owed to the supplier.
 * Legacy voids without a recorded void_date are omitted (same honesty rule as AR).
 */
export function buildSupplierStatement(
  docs: SupplierStatementDoc[],
  range: { from: string | null; to: string | null },
): SupplierStatementCurrency[] {
  assertSupplierStatementRange(range.from, range.to);
  return buildCustomerStatement(docs.map(toArDoc), range, SUPPLIER_NOUNS).map((currency) => ({
    ...currency,
    lines: currency.lines.map((line) => ({
      ...line,
      type: remapLineType(line.type),
    })),
  }));
}
