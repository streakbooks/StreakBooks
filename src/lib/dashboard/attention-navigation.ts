/**
 * Dashboard task-queue tabs are browser navigation state, not financial data.
 * Invalid or unrecognized parameters must never become redirect destinations.
 */
export const DASHBOARD_ATTENTION_FILTERS = [
  "all",
  "overdue",
  "upcoming",
  "bank",
] as const;

export type DashboardAttentionFilter = (typeof DASHBOARD_ATTENTION_FILTERS)[number];
export type DashboardSearch = { attention?: DashboardAttentionFilter };

export function parseDashboardSearch(raw: Record<string, unknown>): DashboardSearch {
  const attention = raw["attention"];
  if (
    typeof attention === "string" &&
    (DASHBOARD_ATTENTION_FILTERS as readonly string[]).includes(attention)
  ) {
    return { attention: attention as DashboardAttentionFilter };
  }
  return {};
}
