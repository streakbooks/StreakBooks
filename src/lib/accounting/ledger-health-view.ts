import { toCsv } from "@/lib/sales/csv";
import type { HealthCheck, HealthReport, HealthStatus } from "./ledger-health";

export type HealthFilter = "all" | "issues" | HealthStatus;

export function healthStatusCounts(checks: readonly HealthCheck[]) {
  return {
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
    pass: checks.filter((c) => c.status === "pass").length,
    na: checks.filter((c) => c.status === "na").length,
  };
}

/** Presentation-only filter: never recalculate the report's authoritative overall result. */
export function filteredHealthChecks(
  checks: readonly HealthCheck[],
  filter: HealthFilter,
  search: string,
): HealthCheck[] {
  const term = search.trim().toLocaleLowerCase();
  return checks.filter((check) => {
    if (filter === "issues" && check.status !== "fail" && check.status !== "warn") return false;
    if (filter !== "all" && filter !== "issues" && check.status !== filter) return false;
    if (!term) return true;
    const haystack = [
      check.label,
      check.key,
      check.summary,
      ...check.items.flatMap((item) => Object.values(item).map(String)),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(term);
  });
}

/**
 * Export the checks and only the issue samples returned by the server. This is NOT
 * a complete journal/subledger export if a check has more findings than samples.
 * toCsv neutralises spreadsheet formulas in untrusted database text.
 */
export function ledgerHealthCsv(report: HealthReport): string {
  const rows: unknown[][] = report.checks.map((check) => [
    check.key,
    check.label,
    check.status,
    check.count,
    check.summary,
    "",
  ]);
  for (const check of report.checks) {
    for (const item of check.items) {
      const detail = Object.entries(item)
        .filter(([, value]) => value !== null && value !== "")
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · ");
      rows.push([check.key, check.label, check.status, check.count, "", detail]);
    }
  }
  return toCsv(
    ["Check key", "Check", "Status", "Total findings", "Summary", "Sample detail"],
    rows,
  );
}
