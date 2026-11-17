/**
 * Quiet-hours evaluation for messaging desktop/email digests.
 * Times are local clock `HH:MM` (24h). Null/empty start or end disables quiet hours.
 */

export function parseMessagingQuietTime(value: string | null | undefined): number | null {
  if (!value || typeof value !== "string") return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when `now` falls inside the quiet window (supports overnight ranges). */
export function isWithinMessagingQuietHours(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const startMin = parseMessagingQuietTime(start);
  const endMin = parseMessagingQuietTime(end);
  if (startMin == null || endMin == null) return false;
  if (startMin === endMin) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  if (startMin < endMin) {
    return current >= startMin && current < endMin;
  }
  // Overnight: e.g. 22:00 → 07:00
  return current >= startMin || current < endMin;
}
