/** Browser-safe, same-origin relative links only. External URLs never come from notifications. */
export function safeNotificationPath(path: string | null): string | null {
  if (!path || !/^\/(?!\/)[a-zA-Z0-9/_?=&.%-]*$/.test(path)) return null;
  return path;
}

export type NotificationView = "all" | "unread" | "action" | "critical" | "completed" | "archived";
export type NotificationSort = "priority" | "newest" | "oldest";
export type FilterableAlert = {
  title: string;
  body: string;
  category: string;
  priority: string;
  read_at: string | null;
  archived_at: string | null;
  resolved_at: string | null;
};
export type SortableAlert = FilterableAlert & { id: string; created_at: string };

export function filterActionNotifications<T extends FilterableAlert>(
  rows: readonly T[],
  options: { view: NotificationView; category: string; search: string; priority?: string },
): T[] {
  const needle = options.search.trim().toLocaleLowerCase();
  return rows.filter((n) => {
    if (options.category !== "all" && n.category !== options.category) return false;
    if (options.priority && options.priority !== "all" && n.priority !== options.priority) {
      return false;
    }
    if (needle && ![n.title, n.body].join(" ").toLocaleLowerCase().includes(needle)) {
      return false;
    }
    switch (options.view) {
      case "unread":
        return !n.read_at && !n.archived_at && !n.resolved_at;
      case "action":
        return !n.archived_at && !n.resolved_at;
      case "critical":
        return n.priority === "critical" && !n.archived_at && !n.resolved_at;
      case "completed":
        return Boolean(n.resolved_at) && !n.archived_at;
      case "archived":
        return Boolean(n.archived_at);
      case "all":
        return true;
    }
  });
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Stable urgency ordering; never mutates React Query's cached array. */
export function sortActionNotifications<T extends SortableAlert>(
  rows: readonly T[],
  sort: NotificationSort,
): T[] {
  return [...rows].sort((a, b) => {
    if (sort === "priority") {
      const order = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
      if (order !== 0) return order;
    }
    const aTime = Date.parse(a.created_at) || 0;
    const bTime = Date.parse(b.created_at) || 0;
    const dateDifference = sort === "oldest" ? aTime - bTime : bTime - aTime;
    return dateDifference || a.id.localeCompare(b.id);
  });
}

/** Counts are computed over the loaded window, not the whole server-side inbox. */
export function summarizeActionNotifications(rows: readonly FilterableAlert[]) {
  const totals = { action: 0, unread: 0, critical: 0, completed: 0, archived: 0 };
  for (const row of rows) {
    if (row.archived_at) {
      totals.archived++;
    } else if (row.resolved_at) {
      totals.completed++;
    } else {
      totals.action++;
      if (!row.read_at) totals.unread++;
      if (row.priority === "critical") totals.critical++;
    }
  }
  return totals;
}

/** Do not display the same alert twice if live inserts shift offset-based history pages. */
export function mergeNotificationPages<T extends { id: string }>(
  pages: readonly (readonly T[])[],
): T[] {
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    page.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }),
  );
}

export type ActionCenterSearch = {
  view?: NotificationView;
  category?: string;
  priority?: string;
  sort?: NotificationSort;
  q?: string;
};

const ACTION_CATEGORIES = new Set([
  "bill_approval",
  "overdue_invoice",
  "bank_reconciliation",
  "document_request",
  "contact_followup",
  "system",
]);
const ACTION_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const ACTION_VIEWS = new Set<NotificationView>([
  "all",
  "unread",
  "action",
  "critical",
  "completed",
  "archived",
]);
const ACTION_SORTS = new Set<NotificationSort>(["priority", "newest", "oldest"]);

/** Shareable, strictly bounded URL state; no external storage of company or user data. */
export function parseActionCenterSearch(raw: Record<string, unknown>): ActionCenterSearch {
  const result: ActionCenterSearch = {};
  const view = raw["view"];
  if (typeof view === "string" && ACTION_VIEWS.has(view as NotificationView)) {
    result.view = view as NotificationView;
  }
  const category = raw["category"];
  if (typeof category === "string" && ACTION_CATEGORIES.has(category)) {
    result.category = category;
  }
  const priority = raw["priority"];
  if (typeof priority === "string" && ACTION_PRIORITIES.has(priority)) {
    result.priority = priority;
  }
  const sort = raw["sort"];
  if (typeof sort === "string" && ACTION_SORTS.has(sort as NotificationSort)) {
    result.sort = sort as NotificationSort;
  }
  const text = raw["q"];
  if (typeof text === "string") {
    const clean = text.trim().slice(0, 120);
    if (clean) result.q = clean;
  }
  return result;
}
