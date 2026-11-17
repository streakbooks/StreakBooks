/**
 * Compact relative timestamps for messaging lists (local clock).
 */

export function formatMessagingRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - now.getTime();
  const absSec = Math.round(Math.abs(diffMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absSec < 45) return rtf.format(Math.round(diffMs / 1000), "second");
  const absMin = Math.round(absSec / 60);
  if (absMin < 60) return rtf.format(Math.round(diffMs / 60_000), "minute");
  const absHour = Math.round(absMin / 60);
  if (absHour < 36) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  const absDay = Math.round(absHour / 24);
  if (absDay < 14) return rtf.format(Math.round(diffMs / 86_400_000), "day");
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
