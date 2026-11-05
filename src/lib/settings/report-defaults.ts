import type { ReportSearch } from "@/lib/reports/search";

/**
 * Report defaults are organisation preferences, not enforced policy.
 * Explicit report URL filters always take precedence.
 */
export function applyOrganisationReportDefaults(
  search: ReportSearch,
  document: Record<string, unknown> | null | undefined,
): ReportSearch {
  if (search.basis === "cash" || search.basis === "accrual") return search;
  const basis = document?.["default_basis"] === "cash" ? "cash" : "accrual";
  return { ...search, basis };
}
