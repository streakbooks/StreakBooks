import type { ReportSearch } from "@/lib/reports/search";

/**
 * Report defaults are organisation preferences, not enforced policy.
 * Explicit report URL filters and saved report settings always take precedence.
 */
export function applyOrganisationReportDefaults(
  search: ReportSearch,
  document: Record<string, unknown> | null | undefined,
): ReportSearch {
  if (search.settings) return search;
  const basis = document?.["default_basis"] === "cash" ? "cash" : "accrual";
  const defaultComparison = document?.["default_comparison"];
  const columns =
    defaultComparison === "prior_period" || defaultComparison === "prior_year"
      ? defaultComparison
      : undefined;
  const merged: ReportSearch = { ...search, basis: search.basis ?? basis };
  if (columns && !search.columns && !search.compare) merged.columns = columns;
  return merged;
}
