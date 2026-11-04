/**
 * Read-only accountant quality checks. Findings are candidates for human review,
 * not instructions to mutate posted journals or proofs of accounting error.
 */
export type ManualJournalReviewRow = {
  id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  source_type: string;
  memo: string | null;
  currency_code: string;
  reverses_journal_id: string | null;
  reversed_by_journal_id: string | null;
  journal_lines: Array<{
    account_id: string;
    debit_minor: number | string;
    credit_minor: number | string;
  }> | null;
};

export type JournalFindingKind =
  | "possible_duplicate"
  | "imbalanced"
  | "invalid_amount"
  | "both_sides"
  | "zero_line"
  | "missing_lines"
  | "missing_memo";

export type JournalQualityFinding = {
  id: string;
  journalId: string;
  journalNumber: number;
  journalDate: string;
  kind: JournalFindingKind;
  severity: "critical" | "review";
  reason: string;
  relatedJournalId: string | null;
  relatedJournalNumber: number | null;
};

/** JS-safe integer or exact decimal integer text; never round money in a review. */
export function minorValue(value: number | string): bigint | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (!/^\d+$/.test(value)) return null;
  const number = BigInt(value);
  return number <= BigInt(Number.MAX_SAFE_INTEGER) ? number : null;
}

export function reviewManualJournals(rows: ManualJournalReviewRow[]): JournalQualityFinding[] {
  const findings: JournalQualityFinding[] = [];
  const seen = new Map<string, { id: string; number: number }>();
  for (const journal of rows) {
    if (journal.status !== "posted" || journal.source_type !== "manual") continue;
    const add = (
      kind: JournalFindingKind,
      severity: JournalQualityFinding["severity"],
      reason: string,
      related?: { id: string; number: number },
      suffix = "",
    ) => {
      findings.push({
        id: journal.id + ":" + kind + suffix,
        journalId: journal.id,
        journalNumber: journal.journal_number,
        journalDate: journal.journal_date,
        kind,
        severity,
        reason,
        relatedJournalId: related?.id ?? null,
        relatedJournalNumber: related?.number ?? null,
      });
    };
    const memo = (journal.memo ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!memo) add("missing_memo", "review", "No journal narration is recorded.");
    const lines = journal.journal_lines ?? [];
    if (!lines.length) {
      add(
        "missing_lines",
        "critical",
        "No posted journal lines were returned. Verify ledger integrity and access.",
      );
      continue;
    }
    let debitTotal = 0n;
    let creditTotal = 0n;
    let invalid = false;
    const signature: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      const debit = minorValue(line.debit_minor);
      const credit = minorValue(line.credit_minor);
      if (debit === null || credit === null || !line.account_id) {
        invalid = true;
        add(
          "invalid_amount",
          "critical",
          "The journal contains an invalid or unsafe ledger amount or account.",
          undefined,
          ":" + index,
        );
        continue;
      }
      debitTotal += debit;
      creditTotal += credit;
      if (!debit && !credit)
        add("zero_line", "review", "An entry line has no debit or credit.", undefined, ":" + index);
      if (debit > 0n && credit > 0n)
        add(
          "both_sides",
          "critical",
          "A single journal line contains both a debit and a credit.",
          undefined,
          ":" + index,
        );
      signature.push(JSON.stringify([line.account_id, String(debit), String(credit)]));
    }
    if (invalid) continue;
    if (debitTotal !== creditTotal)
      add(
        "imbalanced",
        "critical",
        "Posted debits and credits do not balance in ledger minor units.",
      );
    // A duplicate candidate requires identical date, currency, memo and every
    // account/amount line. Reversed entries and nonmanual source posts are excluded.
    if (
      lines.length < 2 ||
      debitTotal === 0n ||
      debitTotal !== creditTotal ||
      !memo ||
      journal.reverses_journal_id ||
      journal.reversed_by_journal_id
    )
      continue;
    const key = JSON.stringify([
      journal.journal_date,
      journal.currency_code,
      memo,
      signature.sort(),
    ]);
    const previous = seen.get(key);
    if (previous) {
      add(
        "possible_duplicate",
        "review",
        "Same posting date, currency, narration and ledger lines as journal " +
          previous.number +
          ". Verify both entries before changing anything.",
        previous,
      );
    } else {
      seen.set(key, { id: journal.id, number: journal.journal_number });
    }
  }
  return findings.sort((a, b) => {
    const severity = Number(b.severity === "critical") - Number(a.severity === "critical");
    return (
      severity || b.journalDate.localeCompare(a.journalDate) || b.journalNumber - a.journalNumber
    );
  });
}
