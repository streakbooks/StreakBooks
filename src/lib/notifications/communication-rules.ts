/** Deterministic communication scheduling rules. UTC timestamps are converted using the organisation IANA timezone. */
export type QuietHours = {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};
export function validHourMinute(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function inQuietHours(
  config: QuietHours,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!config.quiet_hours_enabled) return false;
  if (!validHourMinute(config.quiet_hours_start) || !validHourMinute(config.quiet_hours_end)) {
    throw new Error("Invalid quiet-hours time");
  }
  if (config.quiet_hours_start === config.quiet_hours_end) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const current = hour * 60 + minute;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = toMinutes(config.quiet_hours_start);
  const end = toMinutes(config.quiet_hours_end);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function safeSenderName(value: string): string {
  return value
    .replace(/[\r\n<>\\"]/g, "")
    .trim()
    .slice(0, 120);
}
export function emailWithVerifiedSender(verifiedFrom: string, name: string): string {
  const address = /^\s*(?:[^<>]*<)?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?\s*$/.exec(verifiedFrom)?.[1];
  if (!address) throw new Error("EMAIL_FROM must contain a valid sender address");
  const displayName = safeSenderName(name);
  return displayName ? `${displayName} <${address}>` : verifiedFrom;
}
export function isValidReplyTo(value: string): boolean {
  return value === "" || /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
}
