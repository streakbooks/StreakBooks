/** Pure rules used by the protected scheduled communications worker. */
import { inQuietHours, type QuietHours } from "./communication-rules";

export type DigestSchedule = {
  frequency: "off" | "daily" | "weekly";
  weekday: number; // Sunday=0 ... Saturday=6
  hour_local: number; // 0...23
};
export function scheduleIsDue(
  settings: DigestSchedule,
  timeZone: string,
  quiet: QuietHours,
  at: Date,
): boolean {
  if (settings.frequency === "off") return false;
  if (
    !Number.isInteger(settings.hour_local) ||
    settings.hour_local < 0 ||
    settings.hour_local > 23
  ) {
    return false;
  }
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = f.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = days.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
  if (hour !== settings.hour_local) return false;
  if (settings.frequency === "weekly" && weekday !== settings.weekday) return false;
  return !inQuietHours(quiet, timeZone, at);
}
export const htmlDigest = (
  name: string,
  alerts: Array<{ title: string; body: string; priority: string }>,
  escapeHtml: (s: string) => string,
): string =>
  `<h2>LinkBooks action summary — ${escapeHtml(name)}</h2><ol>${alerts
    .map(
      (a) =>
        `<li><strong>${escapeHtml(a.title)}</strong> (${escapeHtml(a.priority)})<p>${escapeHtml(a.body)}</p></li>`,
    )
    .join(
      "",
    )}</ol><p>Sign in to LinkBooks to review these items. This email cannot approve, reconcile, or post financial records.</p>`;
