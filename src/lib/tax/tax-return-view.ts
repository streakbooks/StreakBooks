/** Pure client-side presentation rules; no tax amounts or return state are modified. */
export type SavedReturnFilter = "all" | "draft" | "filed" | "settled";

type ReturnSummaryRow = {
  period_start: string;
  period_end: string;
  basis: string;
  status: string;
  settlement_journal_id: string | null;
};

type PreviewSelection = { start: string; end: string; basis: string };

export function isStaleTaxPreview(
  calculated: PreviewSelection | null,
  selected: PreviewSelection,
): boolean {
  return calculated !== null &&
    (calculated.start !== selected.start ||
      calculated.end !== selected.end ||
      calculated.basis !== selected.basis);
}

export function filterSavedTaxReturns<T extends ReturnSummaryRow>(
  rows: readonly T[],
  text: string,
  status: SavedReturnFilter,
): T[] {
  const search = text.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const haystack = [
      row.period_start,
      row.period_end,
      row.basis,
      row.status,
    ].join(" ").toLocaleLowerCase();
    const matchesText = !search || haystack.includes(search);
    const matchesStatus = status === "all" ||
      (status === "settled" ? Boolean(row.settlement_journal_id) : row.status === status);
    return matchesText && matchesStatus;
  });
}
