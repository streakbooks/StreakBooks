/** Date ranges and derived figures for the billing analytics snapshot. */
export const ANALYTICS_RANGES = [
  { id: "month", label: "This month" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "365d", label: "Last 12 months" },
] as const;

export type AnalyticsRangeId = (typeof ANALYTICS_RANGES)[number]["id"];

export function analyticsRange(id: AnalyticsRangeId, now: Date): { from: string; to: string } {
  const to = new Date(now.getTime());
  const from =
    id === "month"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      : new Date(now.getTime() - { "30d": 30, "90d": 90, "365d": 365 }[id] * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Net revenue after credit notes, excluding tax. */
export function netRevenueMinor(row: { netMinor: number; creditedNetMinor: number }): number {
  return row.netMinor - row.creditedNetMinor;
}

/** Share of requested cancellations that were withdrawn; null when nothing was requested. */
export function saveRate(requested: number, reversed: number): number | null {
  return requested > 0 ? Math.min(1, reversed / requested) : null;
}
