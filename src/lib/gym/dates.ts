/** Calendar dates as YYYY-MM-DD. Month arithmetic clamps to the last valid day. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = ISO.exec(value);
  if (!match) throw new Error("Date must be YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("Date is not a real calendar day");
  }
  return { year, month, day };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonths(iso: string, months: number): string {
  if (!Number.isSafeInteger(months)) throw new Error("Months must be a whole number");
  const { year, month, day } = parseIsoDate(iso);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return formatIsoDate(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, last));
}

export function addDays(iso: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error("Days must be a whole number");
  const { year, month, day } = parseIsoDate(iso);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function daysBetween(start: string, end: string): number {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  const from = Date.UTC(a.year, a.month - 1, a.day);
  const to = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((to - from) / 86_400_000);
}
