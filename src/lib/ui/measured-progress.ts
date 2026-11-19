/**
 * Honest progress math for measurable workflows.
 * Never invents percentages — callers must pass real completed/total counts.
 */

export type MeasuredProgressValues = {
  completed: number;
  total: number;
};

export function clampMeasuredProgress({
  completed,
  total,
}: MeasuredProgressValues): MeasuredProgressValues {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const safeCompleted =
    Number.isFinite(completed) && completed > 0 ? Math.floor(completed) : 0;
  return {
    completed: safeTotal === 0 ? 0 : Math.min(safeCompleted, safeTotal),
    total: safeTotal,
  };
}

/** Integer percent in 0–100. Returns 0 when total is 0 (unknown/empty), never NaN. */
export function measuredProgressPercent(values: MeasuredProgressValues): number {
  const { completed, total } = clampMeasuredProgress(values);
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function measuredProgressLabel(
  values: MeasuredProgressValues,
  options: { unit?: string; emptyLabel?: string } = {},
): string {
  const { completed, total } = clampMeasuredProgress(values);
  const unit = options.unit?.trim();
  if (total === 0) return options.emptyLabel ?? "No items to measure";
  const noun = unit ? ` ${unit}` : "";
  return `${completed} of ${total}${noun} complete`;
}
