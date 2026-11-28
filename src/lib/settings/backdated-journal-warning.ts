/** Return a non-blocking warning when a manual journal crosses its configured age threshold. */
export function backdatedJournalWarning(
  journalDate: string,
  thresholdDays: number,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  if (!Number.isInteger(thresholdDays) || thresholdDays <= 0) return null;
  if (!isRealIsoDay(journalDate) || !isRealIsoDay(today)) return null;

  const ageDays =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${journalDate}T00:00:00Z`)) / 86_400_000;
  if (ageDays < thresholdDays) return null;

  return `This journal is dated ${ageDays} days before today, beyond the ${thresholdDays}-day backdate warning threshold.`;
}

function isRealIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
