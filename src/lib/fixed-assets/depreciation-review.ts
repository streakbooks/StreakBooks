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
        if (
          !Number.isSafeInteger(row.amount_minor) ||
          row.amount_minor <= 0 ||
          !Number.isSafeInteger(row.accumulated_after_minor) ||
          row.accumulated_after_minor < row.amount_minor
        ) {
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
  const validMonth = (value: string) =>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
  if (
    !validMonth(selectedMonth) ||
    (outstandingMonth !== null &&
      (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(outstandingMonth) ||
        Number(outstandingMonth.slice(0, 4)) === 0))
  ) {
    throw new Error("Choose a valid depreciation month.");
  }
  if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 36) {
    throw new Error("The maximum posting batch is 36 months.");
  }
  const start =
    outstandingMonth && outstandingMonth.slice(0, 7) <= selectedMonth
      ? outstandingMonth
      : selectedMonth + "-01";
  const end = selectedMonth + "-01";
  // Calculate months without unbounded iteration.
  const count =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7)) +
    1;
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("Invalid depreciation range.");
  }
  const length = Math.min(count, maxMonths);
  const periodEnds = Array.from({ length }, (_, index) => monthEnd(addMonthsIso(start, index)));
  return {
    periodEnds,
    remainingMonths: count - length,
    firstPeriodEnd: periodEnds[0]!,
    lastPeriodEnd: periodEnds[periodEnds.length - 1]!,
  };
}

/**
 * Server-side posting request guard, independent of UI prompts.
 * Never silently deduplicate, reorder or skip a posting period: an API caller
 * must explicitly request consecutive chronological month ends (max 36).
 */
export function validateDepreciationPostingPeriods(
  requested: readonly string[],
  latestAllowedMonthEnd: string,
): string[] {
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new Error("Choose at least one depreciation month.");
  }
  if (requested.length > 36) {
    throw new Error("Run at most 36 consecutive months at a time.");
  }
  if (
    !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(latestAllowedMonthEnd) ||
    Number(latestAllowedMonthEnd.slice(0, 4)) === 0 ||
    monthEnd(latestAllowedMonthEnd) !== latestAllowedMonthEnd
  ) {
    throw new Error("Invalid permitted posting month.");
  }
  for (let i = 0; i < requested.length; i++) {
    const period = requested[i];
    if (
      typeof period !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(period) ||
      Number(period.slice(0, 4)) === 0 ||
      monthEnd(period) !== period
    ) {
      throw new Error("Every requested depreciation period must be a real month end.");
    }
    if (period > latestAllowedMonthEnd) {
      throw new Error("Cannot post depreciation for a month that has not started.");
    }
    if (i > 0) {
      const expected = monthEnd(addMonthsIso(requested[i - 1]!.slice(0, 7) + "-01", 1));
      if (period !== expected) {
        throw new Error(
          "Depreciation months must be consecutive, chronological and contain no duplicates.",
        );
      }
    }
  }
  return [...requested];
}

/**
 * Exact preview/posting sum at API number boundaries. Never round an unsafe
 * accumulated total using IEEE doubles even when every line is individually safe.
 */
export function exactDepreciationTotalMinor(
  rows: readonly Pick<DepreciationRunRow, "status" | "amount_minor">[],
  includedStatus: "due" | "posted",
): string {
  let total = 0n;
  for (const row of rows) {
    if (row.status !== includedStatus) continue;
    if (!Number.isSafeInteger(row.amount_minor) || row.amount_minor <= 0) {
      throw new Error("Depreciation includes an invalid positive minor-unit charge.");
    }
    total += BigInt(row.amount_minor);
  }
  return total.toString();
}

export function safeDepreciationTotalMinor(
  rows: readonly Pick<DepreciationRunRow, "status" | "amount_minor">[],
  includedStatus: "due" | "posted",
): number {
  const exact = BigInt(exactDepreciationTotalMinor(rows, includedStatus));
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Depreciation total exceeds exact API number precision.");
  }
  return Number(exact);
}
