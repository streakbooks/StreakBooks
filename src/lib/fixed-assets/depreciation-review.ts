import { addMonthsIso, monthEnd } from "@/lib/accounting/fiscal-year";
import type { DepreciationRunRow } from "./fixed-assets.functions";

export type DepreciationPreviewSummary = {
  due: number;
  behind: number;
  notStarted: number;
  alreadyDone: number;
  fullyDepreciated: number;
  totalDueMinor: string;
};

/** Read-only preview guard: no stale or unsafe monetary totals are suitable for approval. */
export function summarizeDepreciationPreview(
  rows: readonly DepreciationRunRow[],
  serverTotalMinor: number,
): DepreciationPreviewSummary {
  if (!Number.isSafeInteger(serverTotalMinor) || serverTotalMinor < 0) {
    throw new Error("Depreciation preview total is not an exact nonnegative amount.");
  }
  const seen = new Set<string>();
  const result: DepreciationPreviewSummary = {
    due: 0,
    behind: 0,
    notStarted: 0,
    alreadyDone: 0,
    fullyDepreciated: 0,
    totalDueMinor: "0",
  };
  let total = 0n;
  for (const row of rows) {
    if (seen.has(row.asset_id)) throw new Error("Duplicate asset in depreciation preview.");
    seen.add(row.asset_id);
    switch (row.status) {
      case "due":
        if (!Number.isSafeInteger(row.amount_minor) || row.amount_minor <= 0 ||
            !Number.isSafeInteger(row.accumulated_after_minor) ||
            row.accumulated_after_minor < row.amount_minor) {
          throw new Error("Invalid amount in depreciation preview.");
        }
        result.due++;
        total += BigInt(row.amount_minor);
        break;
      case "behind":
        result.behind++;
        break;
      case "not_started":
        result.notStarted++;
        break;
      case "done":
      case "posted":
        result.alreadyDone++;
        break;
      case "nothing_left":
        result.fullyDepreciated++;
        break;
      default:
        throw new Error("Unknown depreciation preview status.");
    }
  }
  if (total !== BigInt(serverTotalMinor)) {
    throw new Error("Depreciation preview total differs from its asset lines.");
  }
  result.totalDueMinor = total.toString();
  return result;
}

export type DepreciationRunPlan = {
  periodEnds: string[];
  remainingMonths: number;
  firstPeriodEnd: string;
  lastPeriodEnd: string;
};

/**
 * Creates a bounded, consecutive posting proposal from the first outstanding month.
 * The server limits each request to 36 periods. There is no autonomous catch-up or posting.
 */
export function planDepreciationMonths(
  outstandingMonth: string | null,
  selectedMonth: string,
  maxMonths = 36,
): DepreciationRunPlan {
  if (!/^\d{4}-\d{2}$/.test(selectedMonth) ||
      (outstandingMonth !== null && !/^\d{4}-\d{2}-01$/.test(outstandingMonth))) {
    throw new Error("Choose a valid depreciation month.");
  }
  if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 36) {
    throw new Error("The maximum posting batch is 36 months.");
  }
  const start = outstandingMonth && outstandingMonth.slice(0, 7) <= selectedMonth
    ? outstandingMonth
    : selectedMonth + "-01";
  const end = selectedMonth + "-01";
  // Calculate months without unbounded iteration.
  const count =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("Invalid depreciation range.");
  }
  const length = Math.min(count, maxMonths);
  const periodEnds = Array.from({ length }, (_, index) =>
    monthEnd(addMonthsIso(start, index)),
  );
  return {
    periodEnds,
    remainingMonths: count - length,
    firstPeriodEnd: periodEnds[0]!,
    lastPeriodEnd: periodEnds[periodEnds.length - 1]!,
  };
}
