import {
  signedWorkpaperLedger,
  workpaperReviewState,
  type AccountWorkpaper,
  type WorkpaperReviewState,
} from "./workpapers";

/** All figures use signed, base-currency minor units: debit positive, credit negative. */
export type ComparedLedgerAccount = {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  debit_minor: number;
  credit_minor: number;
};

export type WorkpaperPeriodComparisonRow = {
  accountId: string;
  code: string;
  name: string;
  currentMinor: number | null;
  previousMinor: number | null;
  movementMinor: number | null;
  currentState: WorkpaperReviewState | "unsafe";
  previousState: WorkpaperReviewState | "unsafe" | "not_available";
  currentEvidenceReference: string | null;
  previousEvidenceReference: string | null;
  requiresInvestigation: boolean;
};

/** A cross-period comparison is informational; approval is NEVER carried forward. */
export function compareWorkpaperPeriods(
  current: ComparedLedgerAccount[],
  previous: ComparedLedgerAccount[],
  currentPapers: AccountWorkpaper[],
  previousPapers: AccountWorkpaper[],
): WorkpaperPeriodComparisonRow[] {
  const previousByAccount = new Map(previous.map((row) => [row.account_id, row]));
  const currentPaperByAccount = new Map(currentPapers.map((paper) => [paper.account_id, paper]));
  const previousPaperByAccount = new Map(previousPapers.map((paper) => [paper.account_id, paper]));
  const safeBalance = (row: ComparedLedgerAccount): number | null => {
    try {
      return signedWorkpaperLedger(row.debit_minor, row.credit_minor);
    } catch {
      return null;
    }
  };
  return current
    .filter((row) => ["asset", "liability", "equity"].includes(row.account_type))
    .map((row) => {
      const old = previousByAccount.get(row.account_id);
      const currentMinor = safeBalance(row);
      const previousMinor = old ? safeBalance(old) : null;
      let movementMinor: number | null = null;
      if (currentMinor !== null && previousMinor !== null) {
        const movement = BigInt(currentMinor) - BigInt(previousMinor);
        if (
          movement >= -BigInt(Number.MAX_SAFE_INTEGER) &&
          movement <= BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          movementMinor = Number(movement);
        }
      }
      const currentPaper = currentPaperByAccount.get(row.account_id);
      const previousPaper = previousPaperByAccount.get(row.account_id);
      const currentState: WorkpaperPeriodComparisonRow["currentState"] =
        currentMinor === null ? "unsafe" : workpaperReviewState(currentPaper, currentMinor);
      const previousState: WorkpaperPeriodComparisonRow["previousState"] = !old
        ? "not_available"
        : previousMinor === null
          ? "unsafe"
          : workpaperReviewState(previousPaper, previousMinor);
      return {
        accountId: row.account_id,
        code: row.code,
        name: row.name,
        currentMinor,
        previousMinor,
        movementMinor,
        currentState,
        previousState,
        currentEvidenceReference: currentPaper?.evidence_reference ?? null,
        previousEvidenceReference: previousPaper?.evidence_reference ?? null,
        requiresInvestigation:
          movementMinor === null ||
          movementMinor !== 0 ||
          currentState !== "reviewed" ||
          previousState === "stale" ||
          previousState === "difference" ||
          previousState === "unsafe",
      };
    })
    .sort((a, b) => {
      // Surface unsafe and changed balances first. Never rank movement by unsafe floats.
      if (a.movementMinor === null && b.movementMinor !== null) return -1;
      if (a.movementMinor !== null && b.movementMinor === null) return 1;
      const aAbs = BigInt(a.movementMinor ?? 0);
      const bAbs = BigInt(b.movementMinor ?? 0);
      const aMagnitude = aAbs < 0n ? -aAbs : aAbs;
      const bMagnitude = bAbs < 0n ? -bAbs : bAbs;
      if (aMagnitude !== bMagnitude) return aMagnitude > bMagnitude ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
}
