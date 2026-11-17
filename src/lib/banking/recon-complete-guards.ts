/**
 * Reconciliation completion honesty gates (UI + server must agree).
 * Outstanding ledger-only lines are capped in the workspace list; completing while truncated
 * would leave uncleared GL lines neither ticked nor intentionally left outstanding.
 */

export const LEDGER_ONLY_REVIEW_CAP = 2000;

export function isLedgerOnlyReviewTruncated(
  outstandingCount: number,
  cap: number = LEDGER_ONLY_REVIEW_CAP,
): boolean {
  return outstandingCount > cap;
}

export function assertLedgerOnlyReviewable(
  outstandingCount: number,
  cap: number = LEDGER_ONLY_REVIEW_CAP,
): void {
  if (!isLedgerOnlyReviewTruncated(outstandingCount, cap)) return;
  throw new Error(
    `Too many outstanding ledger lines (${outstandingCount}) to complete safely. Narrow the statement date so at most ${cap} can be reviewed.`,
  );
}
