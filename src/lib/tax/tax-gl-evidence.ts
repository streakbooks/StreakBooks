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
      const move =
        side === "output"
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

/**
 * Non-cryptographic change detector over all journal lines, including lines
 * beyond the first 100 displayed. It is a review staleness hint, not a
 * tamper-proof audit seal or compliance attestation.
 */
export function taxGlJournalDigest(lines: readonly PostedLine[]): string {
  let hash = 14695981039346656037n;
  const mask = (1n << 64n) - 1n;
  const ordered = [...lines].sort(
    (a, b) =>
      (a.line_id ?? "").localeCompare(b.line_id ?? "") ||
      (a.journal_id ?? "").localeCompare(b.journal_id ?? ""),
  );
  for (const line of ordered) {
    const value =
      [
        line.line_id ?? "",
        line.journal_id ?? "",
        line.journal_date,
        line.account_id,
        line.source_type ?? "",
        String(line.debit_minor),
        String(line.credit_minor),
      ].join("|") + "\n";
    for (let i = 0; i < value.length; i++) {
      hash ^= BigInt(value.charCodeAt(i));
      hash = (hash * 1099511628211n) & mask;
    }
  }
  return hash.toString(16).padStart(16, "0");
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
  journalDigest: string;
}): string {
  return [
    value.periodStart,
    value.periodEnd,
    value.basis,
    value.outputAccountId,
    value.inputAccountId,
    value.returnOutputMinor,
    value.returnInputMinor,
    value.glOutputMinor,
    value.glInputMinor,
    String(value.journalLines),
    value.documentOutputMinor,
    value.documentInputMinor,
    value.reversalOutputMinor,
    value.reversalInputMinor,
    value.journalDigest,
  ].join("|");
}
