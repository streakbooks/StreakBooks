import { exactJournalMinor } from "./journal-amounts";

export type JournalReviewHeader = {
  id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  source_type: string;
  currency_code: string;
  total_debit_minor: number;
};

export type JournalReviewDetail = {
  id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  source_type: string;
  currency_code: string;
  lines: ReadonlyArray<{
    id: string;
    line_no: number;
    account_code: string;
    debit_minor: number;
    credit_minor: number;
  }>;
};

export type JournalLineReview = {
  state: "balanced" | "exception" | "not_posted";
  debitMinor: number | null;
  creditMinor: number | null;
  issues: string[];
};

/**
 * Review the retrieved journal header against its expanded, authorised lines.
 * Only a row/detail consistency check: it does NOT verify a separate GL posting,
 * source subledger, external bank statement, or FX-to-base valuation.
 */
export function reviewJournalLines(
  header: JournalReviewHeader,
  detail: JournalReviewDetail,
): JournalLineReview {
  const issues: string[] = [];
  if (header.id !== detail.id || header.journal_number !== detail.journal_number) {
    issues.push("The selected journal does not match the expanded journal.");
  }
  if (header.journal_date !== detail.journal_date || header.source_type !== detail.source_type) {
    issues.push("Journal date or source differs between the list and detail.");
  }
  if (!header.currency_code?.trim() || header.currency_code !== detail.currency_code) {
    issues.push("Journal currency is missing or differs between the list and detail.");
  }
  if (header.status !== detail.status) {
    issues.push("Journal status changed between the list and detail. Refresh the list.");
  }
  if (header.status !== "posted" || detail.status !== "posted") {
    return {
      state: issues.length ? "exception" : "not_posted",
      debitMinor: null,
      creditMinor: null,
      issues,
    };
  }

  if (detail.lines.length < 2) {
    issues.push("A posted journal must contain at least two lines.");
  }
  const ids = new Set<string>();
  const numbers = new Set<number>();
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const [i, line] of detail.lines.entries()) {
    const index = i + 1;
    if (!line.id || ids.has(line.id)) issues.push(`Line ${index} has a missing or duplicate ID.`);
    ids.add(line.id);
    if (!Number.isSafeInteger(line.line_no) || line.line_no < 1 || numbers.has(line.line_no)) {
      issues.push(`Line ${index} has an invalid or duplicate line number.`);
    }
    numbers.add(line.line_no);
    if (!line.account_code?.trim()) issues.push(`Line ${index} has no linked account.`);
    try {
      const debit = exactJournalMinor(line.debit_minor, `Line ${index} debit`);
      const credit = exactJournalMinor(line.credit_minor, `Line ${index} credit`);
      if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
        issues.push(`Line ${index} must have either a debit or a credit, not both/neither.`);
      }
      totalDebit += BigInt(debit);
      totalCredit += BigInt(credit);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : `Line ${index} has invalid amounts.`);
    }
  }

  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (totalDebit > max || totalCredit > max) {
    issues.push("Journal total exceeds safe display precision.");
  }
  if (totalDebit !== totalCredit) {
    issues.push("Journal debit and credit totals are not equal.");
  }
  try {
    const expected = exactJournalMinor(header.total_debit_minor, "Journal list total");
    if (BigInt(expected) !== totalDebit) {
      issues.push("Expanded debit total differs from the journal list.");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Invalid journal list total.");
  }
  return {
    state: issues.length ? "exception" : "balanced",
    debitMinor: totalDebit <= max ? Number(totalDebit) : null,
    creditMinor: totalCredit <= max ? Number(totalCredit) : null,
    issues,
  };
}
