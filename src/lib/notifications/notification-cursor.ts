import type { NotificationSort } from "./notification-utils";

export type NotificationCursor = {
  priorityRank: number;
  createdAt: string;
  id: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Keyset pagination filter for the security-invoker Action Center view.
 * Inputs are copied only from database-returned UUID/timestamp/rank columns.
 * Unlike offsets, new alerts inserted before the cursor do not shift later pages.
 */
export function notificationCursorFilter(
  cursor: NotificationCursor,
  sort: NotificationSort,
): string {
  const { priorityRank, createdAt, id } = cursor;
  if (!UUID.test(id) || !DB_TIMESTAMP.test(createdAt) || !Number.isInteger(priorityRank) ||
      priorityRank < 0 || priorityRank > 3) {
    throw new Error("Invalid notification history cursor");
  }
  const cmp = sort === "oldest" ? "gt" : "lt";
  const tie = `and(created_at.eq.${createdAt},id.${cmp}.${id})`;
  if (sort !== "priority") {
    return `created_at.${cmp}.${createdAt},${tie}`;
  }
  return [
    `priority_rank.gt.${priorityRank}`,
    `and(priority_rank.eq.${priorityRank},created_at.lt.${createdAt})`,
    `and(priority_rank.eq.${priorityRank},created_at.eq.${createdAt},id.lt.${id})`,
  ].join(",");
}

export function nextNotificationCursor<T extends {
  id: string; created_at: string; priority_rank: number;
}>(rows: readonly T[], pageSize: number): NotificationCursor | null {
  if (rows.length <= pageSize || pageSize < 1) return null;
  const last = rows[pageSize - 1];
  return {
    priorityRank: last.priority_rank,
    createdAt: last.created_at,
    id: last.id,
  };
}
