import type { PostedLine } from "@/lib/accounting/reporting";

export type TaxJournalEvidence = {
  lineId: string;
  journalId: string;
  journalNumber: number;
  journalDate: string;
  sourceType: string;
  accountCode: string;
  accountName: string;
  accountSide: "output" | "input";
  movementMinor: string;
};

/** Ordered, bounded evidence; journal ids provide a route to accounting drill-down. */
export function taxJournalEvidence(
  lines: readonly PostedLine[],
  outputAccountId: string,
  inputAccountId: string,
  maxRows = 100,
): { total: number; rows: TaxJournalEvidence[]; truncated: boolean } {
  const matching = lines.filter(
    (l) => l.account_id === outputAccountId || l.account_id === inputAccountId,
  );
  const ordered = [...matching].sort(
    (a, b) =>
      b.journal_date.localeCompare(a.journal_date) ||
      (b.journal_number ?? 0) - (a.journal_number ?? 0) ||
      (b.line_no ?? 0) - (a.line_no ?? 0),
  );
  return {
    total: matching.length,
    truncated: matching.length > maxRows,
    rows: ordered.slice(0, maxRows).map((l) => {
      const side = l.account_id === outputAccountId ? "output" : "input";
      const move = side === "output"
        ? BigInt(l.credit_minor) - BigInt(l.debit_minor)
        : BigInt(l.debit_minor) - BigInt(l.credit_minor);
      return {
        lineId: l.line_id ?? "",
        journalId: l.journal_id ?? "",
        journalNumber: l.journal_number ?? 0,
        journalDate: l.journal_date,
        sourceType: l.source_type ?? "other",
        accountCode: l.account_code,
        accountName: l.account_name,
        accountSide: side,
        movementMinor: move.toString(),
      };
    }),
  };
}

/** Stable evidence fingerprint for detecting a review stale against new postings. */
export function taxGlReviewSnapshot(value: {
  periodStart: string;
  periodEnd: string;
  basis: string;
  outputAccountId: string;
  inputAccountId: string;
  returnOutputMinor: string;
  returnInputMinor: string;
  glOutputMinor: string;
  glInputMinor: string;
  journalLines: number;
  // Added to distinguish documents/reversals/manual changes even when totals net out.
  documentOutputMinor: string;
  documentInputMinor: string;
  reversalOutputMinor: string;
  reversalInputMinor: string;
}): string {
  return [
    value.periodStart, value.periodEnd, value.basis,
    value.outputAccountId, value.inputAccountId,
    value.returnOutputMinor, value.returnInputMinor,
    value.glOutputMinor, value.glInputMinor,
    String(value.journalLines),
    value.documentOutputMinor, value.documentInputMinor,
    value.reversalOutputMinor, value.reversalInputMinor,
  ].join("|");
}
