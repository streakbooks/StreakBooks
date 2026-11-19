import { describe, expect, it } from "vitest";
import {
  nextNotificationCursor,
  notificationCursorFilter,
  notificationPageCountMode,
} from "./notification-cursor";

const stamp = "2026-11-06T12:35:00.123456+00:00";
const id = "11111111-1111-4111-8111-111111111111";
const cursor = { priorityRank: 1, createdAt: stamp, id };

describe("Action Center stable keyset pagination", () => {
  it("counts the complete history once, not after every cursor page", () => {
    expect(notificationPageCountMode(null)).toBe("exact");
    expect(notificationPageCountMode(cursor)).toBeUndefined();
  });
  it("sorts beyond the priority, timestamp and ID cursor", () => {
    expect(notificationCursorFilter(cursor, "priority")).toBe(
      `priority_rank.gt.1,and(priority_rank.eq.1,created_at.lt.${stamp}),` +
        `and(priority_rank.eq.1,created_at.eq.${stamp},id.lt.${id})`,
    );
  });
  it("paginates newest to oldest by timestamp and deterministic UUID ties", () => {
    expect(notificationCursorFilter(cursor, "newest")).toBe(
      `created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${id})`,
    );
  });
  it("paginates oldest to newest with the opposite comparisons", () => {
    expect(notificationCursorFilter(cursor, "oldest")).toBe(
      `created_at.gt.${stamp},and(created_at.eq.${stamp},id.gt.${id})`,
    );
  });
  it("rejects unsafe IDs or unexpected timestamps and ranks", () => {
    expect(() =>
      notificationCursorFilter({ ...cursor, id: "x),title.eq.secret" }, "newest"),
    ).toThrow("Invalid notification history cursor");
    expect(() =>
      notificationCursorFilter({ ...cursor, createdAt: "2026-11-06),id.gt.0" }, "newest"),
    ).toThrow("Invalid notification history cursor");
    expect(() => notificationCursorFilter({ ...cursor, priorityRank: 6 }, "priority")).toThrow(
      "Invalid notification history cursor",
    );
  });
  it("returns only the final visible row as a cursor when there is an extra item", () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: id.replace(/111111111111$/, String(index + 1).padStart(12, "0")),
      created_at: stamp,
      priority_rank: index,
    }));
    expect(nextNotificationCursor(rows, 3)).toEqual({
      id: rows[2]?.id,
      createdAt: stamp,
      priorityRank: 2,
    });
    expect(nextNotificationCursor(rows.slice(0, 3), 3)).toBeNull();
    expect(nextNotificationCursor([], 3)).toBeNull();
  });
});
