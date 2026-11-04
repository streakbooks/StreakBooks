/** Evidence on an account is never a substitute for an authoritative posted ledger. */
export type WorkpaperStatus = "draft" | "prepared" | "reviewed";

export type AccountWorkpaper = {
  id: string;
  company_id: string;
  account_id: string;
  as_of: string;
  gl_balance_minor: number;
  supporting_balance_minor: number | null;
  evidence_reference: string;
  note: string;
  status: WorkpaperStatus;
  prepared_by: string | null;
  reviewed_by: string | null;
  prepared_at: string | null;
  reviewed_at: string | null;
  version: number;
};

export type WorkpaperReviewState =
  | "not_started"
  | "stale"
  | "missing_evidence"
  | "difference"
  | WorkpaperStatus;

/** Signed convention: debits positive, credits negative, in base-currency minor units. */
export function signedWorkpaperLedger(debit: number, credit: number): number {
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
    throw new Error("Ledger balance exceeds the safe integer range for workpaper review.");
  }
  const signed = debit - credit;
  if (!Number.isSafeInteger(signed)) {
    throw new Error("Ledger balance exceeds the safe integer range for workpaper review.");
  }
  return signed;
}

/** A reviewed row becomes visibly stale if later postings change the ledger. */
export function workpaperReviewState(
  workpaper: AccountWorkpaper | undefined,
  liveBalanceMinor: number,
): WorkpaperReviewState {
  if (!workpaper) return "not_started";
  if (workpaper.gl_balance_minor !== liveBalanceMinor) return "stale";
  if (workpaper.supporting_balance_minor === null) return "missing_evidence";
  if (workpaper.supporting_balance_minor !== liveBalanceMinor) return "difference";
  return workpaper.status;
}

export const WORKPAPER_STATE_LABELS: Record<WorkpaperReviewState, string> = {
  not_started: "Not started",
  stale: "Ledger changed",
  missing_evidence: "Evidence missing",
  difference: "Out of balance",
  draft: "Draft",
  prepared: "Awaiting review",
  reviewed: "Independently reviewed",
};
