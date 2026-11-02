/** Date.parse normalises 30 February; reporting dates must represent actual calendar days. */
export function isReportDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function assertReportDate(value: unknown, label: string): string {
  if (!isReportDate(value)) throw new Error(`${label} must be a valid date (YYYY-MM-DD).`);
  return value;
}
