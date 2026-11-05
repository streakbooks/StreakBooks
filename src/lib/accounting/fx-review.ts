import { toCsv } from "@/lib/sales/csv";
import type { AutoReversalRow, RevaluationPreview } from "@/lib/accounting/fx.functions";

/** Use the viewer's calendar day rather than the UTC day for UI-only date limits and filters.
 * Server-side company/period rules still authorize any journal posting.
 */
export function localCalendarDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ReversalFilter = "all" | "due" | "pending" | "failed" | "done" | "cancelled";

/** A stable exact-input signature: any date or rate edit invalidates the preview approval. */
export function fxReviewSignature(
  companyId: string,
  asOf: string,
  rates: Record<string, string>,
): string {
  return JSON.stringify([
    companyId,
    asOf,
    Object.entries(rates)
      .map(([currency, rate]) => [currency.toUpperCase(), rate.trim()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** Read-only screen filter. Date comparisons are safe for ISO yyyy-mm-dd strings. */
export function filterAutoReversals(
  reversals: readonly AutoReversalRow[],
  status: ReversalFilter,
  today: string,
): AutoReversalRow[] {
  if (status === "all") return [...reversals];
  if (status === "due") {
    return reversals.filter(
      (r) => (r.status === "pending" || r.status === "failed") && r.reverse_on <= today,
    );
  }
  return reversals.filter((r) => r.status === status);
}

/** Only the current server-returned revaluation preview is exported; no journals are posted. */
export function fxRevaluationCsv(preview: RevaluationPreview): string {
  return toCsv(
    [
      "As at",
      "Account code",
      "Account",
      "Currency",
      "Foreign net (minor units)",
      "Booked base (minor units)",
      "Rate to base",
      "Closing base (minor units)",
      "Adjustment (minor units)",
      "Rate source",
      "Rate date",
      "Stored rate stale",
    ],
    preview.lines.map((l) => [
      preview.as_of_date,
      l.account_code,
      l.account_name,
      l.currency_code,
      l.txn_net_minor,
      l.booked_base_minor,
      l.rate,
      l.closing_base_minor,
      l.adjustment_minor,
      l.rate_source,
      l.rate_date,
      l.stale ? "Yes" : "No",
    ]),
  );
}
