/** Keep empty or malformed payment terms out of organisation-wide settings. */
export function parsePaymentTermsDays(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return Number.isSafeInteger(days) && days >= 0 && days <= 3650 ? days : null;
}
