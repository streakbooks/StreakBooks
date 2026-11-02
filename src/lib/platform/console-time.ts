/** One locale-aware format. Instants show the viewer zone. Calendar filters stay UTC dates. */

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatConsoleInstant(iso: string, zone = viewerTimeZone()): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "Unknown time";
  const local = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(value);
  return `${local} (${zone})`;
}

export function formatUtcDay(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return isoDay;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(utc);
}
