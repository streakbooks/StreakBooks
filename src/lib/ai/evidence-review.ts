/**
 * Deterministic checks on authorised, already-posted Journal Report rows.
 * Never mistake an equal debit/credit total for a complete accuracy audit.
 */
export type JournalEvidenceRow = {
  journal_id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  source_type: string;
  source_id: string | null;
  memo: string | null;
  currency_code: string;
  total_debit_minor: number;
  total_credit_minor: number;
};

export type JournalEvidenceStatus = "balanced_totals" | "review_totals" | "unavailable" | "not_posted";

export type JournalEvidenceCheck = {
  status: JournalEvidenceStatus;
  explanation: string;
  debit: bigint | null;
  credit: bigint | null;
};

export function assessJournalEvidence(row: JournalEvidenceRow): JournalEvidenceCheck {
  if (row.status !== "posted") {
    return {
      status: "not_posted",
      explanation: "This journal is not posted. Its recorded totals do not establish ledger activity.",
      debit: null,
      credit: null,
    };
  }
  const debit = row.total_debit_minor;
  const credit = row.total_credit_minor;
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
    return {
      status: "unavailable",
      explanation: "The report amounts cannot be verified as exact integers in this browser view. Open the journal detail.",
      debit: null,
      credit: null,
    };
  }
  const d = BigInt(debit);
  const c = BigInt(credit);
  if (d <= 0n || c <= 0n || d !== c) {
    return {
      status: "review_totals",
      explanation: "The reported posted journal totals are missing, zero or unequal. Open the journal to investigate the underlying entry.",
      debit: d,
      credit: c,
    };
  }
  return {
    status: "balanced_totals",
    explanation: "The reported debit and credit totals are equal. This does not verify account selection, documentation, tax or period.",
    debit: d,
    credit: c,
  };
}

export type JournalEvidencePageSummary = {
  displayed: number;
  balanced: number;
  review: number;
  unavailable: number;
  /** Not a ledger-wide total: only journal rows from the fetched page. */
  pageDebit: bigint | null;
  pageCredit: bigint | null;
  singleCurrency: string | null;
};

export function summariseJournalEvidence(rows: JournalEvidenceRow[]): JournalEvidencePageSummary {
  let balanced = 0;
  let review = 0;
  let pageDebit = 0n;
  let pageCredit = 0n;
  let allExact = true;
  const currency = rows[0]?.currency_code ?? null;
  const singleCurrency =
    currency && rows.every((row) => row.currency_code === currency) ? currency : null;

  for (const row of rows) {
    const check = assessJournalEvidence(row);
    if (check.status === "balanced_totals") balanced++;
    else if (check.status === "review_totals") review++;
    if (check.debit === null || check.credit === null) {
      allExact = false;
      continue;
    }
    pageDebit += check.debit;
    pageCredit += check.credit;
  }
  return {
    displayed: rows.length,
    balanced,
    review,
    unavailable: rows.filter((row) => {
      const state = assessJournalEvidence(row).status;
      return state === "unavailable" || state === "not_posted";
    }).length,
    pageDebit: allExact && singleCurrency ? pageDebit : null,
    pageCredit: allExact && singleCurrency ? pageCredit : null,
    singleCurrency,
  };
}

export type AccountEvidenceLine = {
  journal_id: string;
  journal_number: number;
  journal_date: string;
  debit_minor: number;
  credit_minor: number;
  running_balance_minor: number;
};

export function assessAccountEvidenceLine(line: AccountEvidenceLine): {
  status: "ordinary" | "review" | "unavailable";
  explanation: string;
} {
  if (
    !Number.isSafeInteger(line.debit_minor) ||
    !Number.isSafeInteger(line.credit_minor) ||
    !Number.isSafeInteger(line.running_balance_minor)
  ) {
    return {
      status: "unavailable",
      explanation: "An amount exceeds exact browser integer precision. Review the full posted-ledger report.",
    };
  }
  const d = BigInt(line.debit_minor);
  const c = BigInt(line.credit_minor);
  if (d < 0n || c < 0n || (d > 0n && c > 0n) || (d === 0n && c === 0n)) {
    return {
      status: "review",
      explanation: "This displayed ledger line has unusual debit/credit columns; inspect its journal before drawing conclusions.",
    };
  }
  return {
    status: "ordinary",
    explanation: "A posted ledger movement, not independent evidence of correct classification or reconciliation.",
  };
}
