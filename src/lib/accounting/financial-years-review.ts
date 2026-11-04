import { toCsv } from "@/lib/sales/csv";
import type { PeriodRow } from "@/lib/accounting/accounting.functions";

export type FinancialYearFilter = "all" | "open" | "locked";

export function financialYearSummary(rows: readonly PeriodRow[]) {
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === "open").length,
    locked: rows.filter((row) => row.status === "locked").length,
  };
}

export function filterFinancialYears(
  rows: readonly PeriodRow[],
  filter: FinancialYearFilter,
  search: string,
): PeriodRow[] {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (filter !== "all" && row.status !== filter) return false;
    return (
      !term ||
      [row.name, row.start_date, row.end_date, row.status].some((value) =>
        value.toLocaleLowerCase().includes(term),
      )
    );
  });
}

/** CSV contains the full loaded period catalogue, not only the visible filter. */
export function financialYearsCsv(rows: readonly PeriodRow[]): string {
  return toCsv(
    ["Financial year", "Start date", "End date", "Status", "Period ID"],
    rows.map((row) => [row.name, row.start_date, row.end_date, row.status, row.id]),
  );
}

/** Reject stale or changed period records before a requested unlock. */
export function assertPeriodStillLocked(
  reviewed: PeriodRow,
  latest: PeriodRow | undefined,
): void {
  if (
    !latest ||
    latest.id !== reviewed.id ||
    latest.start_date !== reviewed.start_date ||
    latest.end_date !== reviewed.end_date ||
    latest.status !== "locked"
  ) {
    throw new Error("The period changed or is no longer locked. Refresh and review before unlocking.");
  }
}

export function validPeriodDeepLink(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : undefined;
}
