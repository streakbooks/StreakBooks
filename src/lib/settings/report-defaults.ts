import type { ReportSearch } from "@/lib/reports/search";

/**
 * Report defaults are organisation preferences, not enforced policy.
 * Explicit report URL filters and saved report settings always take precedence.
 */
export function applyOrganisationReportDefaults(
  search: ReportSearch,
  document: Record<string, unknown> | null | undefined,
  accountingBasis: "cash" | "accrual" = "accrual",
): ReportSearch {
  if (search.settings) return search;
  const defaultComparison = document?.["default_comparison"];
  const columns =
    defaultComparison === "prior_period" || defaultComparison === "prior_year"
      ? defaultComparison
      : undefined;
  const merged: ReportSearch = { ...search, basis: search.basis ?? accountingBasis };
  if (columns && !search.columns && !search.compare) merged.columns = columns;
  return merged;
}

/** Firm summaries aggregate several companies. Other report queries have a tenant key. */
export function reportQueryUsesAccountingDefaults(key: readonly unknown[], companyId: string) {
  const name = key[0];
  if (name === "firm-reporting") return true;
  return (
    key.includes(companyId) &&
    typeof name === "string" &&
    ([
      "management-metrics",
      "reporting-basis",
      "dashboard-snapshot",
      "standard-statement",
      "project-profitability",
    ].includes(name) ||
      name.startsWith("report-"))
  );
}
