import type { ReportSearch } from "@/lib/reports/search";

/**
 * Report defaults are organisation preferences, not enforced policy.
 * Explicit report URL filters always take precedence.
 */
export function applyOrganisationReportDefaults(
  search: ReportSearch,
  document: Record<string, unknown> | null | undefined,
): ReportSearch {
  // Saved report settings include their own basis and must not be overridden.
  if (search.basis === "cash" || search.basis === "accrual" || search.settings) return search;
  const basis = document?.["default_basis"] === "cash" ? "cash" : "accrual";
  return { ...search, basis };
}
