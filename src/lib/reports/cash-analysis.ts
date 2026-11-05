import { apportionCumulativeCash } from "./cash-settlement";
import type { CashPnlEntry } from "./cash-profit-loss";

function safeCashNumber(value: bigint) {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error("Cash analysis amount exceeds the supported numeric range");
  return result;
}

export type CashAnalysisDocument = {
  id: string;
  posted_journal_id: string;
  contact_id: string;
  contact_name: string;
  credit: boolean;
};
export type CashAnalysisLine = {
  id: string;
  document_id: string;
  product_id: string | null;
  item_code: string | null;
  item_name: string | null;
  quantity: number;
  net_minor: string | number;
  tax_minor: string | number;
};

/** Document analysis shares the exact recognized tax and net components of the cash ledger. */
export function cashDocumentTotals(
  entries: CashPnlEntry[],
  documents: CashAnalysisDocument[],
  taxIds: ReadonlySet<string>,
  side: "income" | "expense",
) {
  const byJournal = new Map(documents.map((doc) => [doc.posted_journal_id, doc]));
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const sums = new Map<
    string,
    { document: CashAnalysisDocument; net: bigint; tax: bigint; transactionNet: bigint }
  >();
  for (const entry of entries) {
    const doc =
      (entry.sourceId ? byId.get(entry.sourceId) : undefined) ??
      byJournal.get(entry.sourceJournalId);
    if (!doc || entry.reason !== "settlement") continue;
    const value = (entry.debit - entry.credit) * (side === "income" ? -1n : 1n);
    const row = sums.get(doc.id) ?? { document: doc, net: 0n, tax: 0n, transactionNet: 0n };
    if (taxIds.has(entry.accountId)) row.tax += value;
    else {
      row.net += value;
      row.transactionNet +=
        BigInt(entry.sourceTransactionAmount ?? (entry.debit - entry.credit).toString()) *
        (side === "income" ? -1n : 1n);
    }
    sums.set(doc.id, row);
  }
  return [...sums.values()];
}

export function cashContacts(
  entries: CashPnlEntry[],
  documents: CashAnalysisDocument[],
  taxIds: ReadonlySet<string>,
  side: "income" | "expense",
) {
  const contacts = new Map<
    string,
    {
      contact_id: string;
      contact_name: string;
      document_count: number;
      credit_note_count: number;
      net_minor: bigint;
      tax_minor: bigint;
      gross_minor: bigint;
    }
  >();
  for (const { document: doc, net, tax } of cashDocumentTotals(entries, documents, taxIds, side)) {
    if (net === 0n && tax === 0n) continue;
    const row = contacts.get(doc.contact_id) ?? {
      contact_id: doc.contact_id,
      contact_name: doc.contact_name,
      document_count: 0,
      credit_note_count: 0,
      net_minor: 0n,
      tax_minor: 0n,
      gross_minor: 0n,
    };
    if (doc.credit) row.credit_note_count++;
    else row.document_count++;
    row.net_minor += net;
    row.tax_minor += tax;
    row.gross_minor += net + tax;
    contacts.set(doc.contact_id, row);
  }
  return [...contacts.values()]
    .sort((a, b) =>
      a.net_minor === b.net_minor
        ? a.contact_name.localeCompare(b.contact_name)
        : a.net_minor > b.net_minor
          ? -1
          : 1,
    )
    .map((r) => ({
      ...r,
      net_minor: safeCashNumber(r.net_minor),
      tax_minor: safeCashNumber(r.tax_minor),
      gross_minor: safeCashNumber(r.gross_minor),
    }));
}

/** Cumulative apportionment keeps item totals exact across multiple payment periods. */
export function cashItems(
  entries: CashPnlEntry[],
  documents: CashAnalysisDocument[],
  lines: CashAnalysisLine[],
  taxIds: ReadonlySet<string>,
  from: string,
) {
  const all = cashDocumentTotals(entries, documents, taxIds, "income");
  const before = new Map(
    cashDocumentTotals(
      entries.filter((e) => e.date < from),
      documents,
      taxIds,
      "income",
    ).map((row) => [row.document.id, row]),
  );
  const result = new Map<
    string,
    {
      product_id: string | null;
      item_code: string | null;
      item_name: string | null;
      quantity: number;
      line_count: number;
      net_minor: bigint;
      tax_minor: bigint;
    }
  >();
  for (const total of all) {
    const detail = lines
      .filter((line) => line.document_id === total.document.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!detail.length)
      throw new Error("Cash item analysis requires the posted document's item detail");
    const prior = before.get(total.document.id);
    const allocate = (value: bigint, key: "net_minor" | "tax_minor") => {
      if (value === 0n) return detail.map(() => 0n);
      const weights = detail.map((line) => BigInt(line[key]));
      const denominator = weights.reduce((sum, n) => sum + n, 0n);
      if (!denominator)
        throw new Error("Cash item amount has no matching source line distribution");
      return apportionCumulativeCash(value < 0n ? -value : value, weights, denominator).map(
        (n) => n * (value < 0n ? -1n : 1n),
      );
    };
    const nets = allocate(total.net, "net_minor"),
      taxes = allocate(total.tax, "tax_minor");
    const priorNets = allocate(prior?.net ?? 0n, "net_minor"),
      priorTaxes = allocate(prior?.tax ?? 0n, "tax_minor");
    const sourceNet = detail.reduce((sum, line) => sum + BigInt(line.net_minor), 0n);
    for (const [index, line] of detail.entries()) {
      const net = nets[index]! - priorNets[index]!,
        tax = taxes[index]! - priorTaxes[index]!;
      const quantity = sourceNet
        ? (line.quantity * Number(total.transactionNet - (prior?.transactionNet ?? 0n))) /
          Number(sourceNet)
        : 0;
      if (net === 0n && tax === 0n && quantity === 0) continue;
      const key = line.product_id ?? "";
      const row = result.get(key) ?? {
        product_id: line.product_id,
        item_code: line.item_code,
        item_name: line.item_name,
        quantity: 0,
        line_count: 0,
        net_minor: 0n,
        tax_minor: 0n,
      };
      row.net_minor += net;
      row.tax_minor += tax;
      row.line_count++;
      row.quantity += quantity;
      result.set(key, row);
    }
  }
  return [...result.values()]
    .map((row) => ({
      ...row,
      net_minor: safeCashNumber(row.net_minor),
      tax_minor: safeCashNumber(row.tax_minor),
    }))
    .sort((a, b) => b.net_minor - a.net_minor);
}
