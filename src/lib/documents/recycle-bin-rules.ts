/** Presentation rules only. PostgreSQL is authoritative for retention and purge. */
export const DEFAULT_DOCUMENT_RETENTION_DAYS = 30;
export const MIN_DOCUMENT_RETENTION_DAYS = 7;
export const MAX_DOCUMENT_RETENTION_DAYS = 3650;

export function validateRetentionDays(input: unknown): number {
  const value = Number(input);
  if (
    (typeof input !== "string" && typeof input !== "number") ||
    String(input).trim() === "" ||
    !Number.isSafeInteger(value) ||
    value < MIN_DOCUMENT_RETENTION_DAYS ||
    value > MAX_DOCUMENT_RETENTION_DAYS
  ) throw new Error("Retention must be between 7 and 3,650 whole days.");
  return value;
}

export function canOfferPermanentPurge(
  file: {
    deleted_at: string | null;
    purge_after: string | null;
    retention_hold: boolean;
  },
  now: number,
): boolean {
  if (!file.deleted_at || !file.purge_after || file.retention_hold ||
      !Number.isFinite(now)) return false;
  const deletedAt = Date.parse(file.deleted_at);
  const purgeAfter = Date.parse(file.purge_after);
  return Number.isFinite(deletedAt) &&
    Number.isFinite(purgeAfter) &&
    purgeAfter > deletedAt &&
    purgeAfter <= now;
}
