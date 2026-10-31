/** Browser-safe, same-origin relative links only. External URLs never come from notifications. */
export function safeNotificationPath(path: string | null): string | null {
  if (!path || !/^\/(?!\/)[a-zA-Z0-9/_?=&.%-]*$/.test(path)) return null;
  return path;
}
export type NotificationView = "all" | "unread" | "action" | "critical" | "completed" | "archived";
export type FilterableAlert = {
  title: string; body: string; category: string; priority: string;
  read_at: string | null; archived_at: string | null; resolved_at: string | null;
};
export function filterActionNotifications<T extends FilterableAlert>(
  rows: T[], options: { view: NotificationView; category: string; search: string },
): T[] {
  const needle = options.search.trim().toLocaleLowerCase();
  return rows.filter((n) => {
    if (options.category !== "all" && n.category !== options.category) return false;
    if (needle && !(`${n.title} ${n.body}`).toLocaleLowerCase().includes(needle)) return false;
    switch (options.view) {
      case "unread": return !n.read_at && !n.archived_at && !n.resolved_at;
      case "action": return !n.archived_at && !n.resolved_at;
      case "critical": return n.priority === "critical" && !n.archived_at && !n.resolved_at;
      case "completed": return Boolean(n.resolved_at) && !n.archived_at;
      case "archived": return Boolean(n.archived_at);
      case "all": return true;
    }
  });
}
