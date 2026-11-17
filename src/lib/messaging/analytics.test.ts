import { describe, expect, it } from "vitest";
import { averageFirstResponseMinutes, summariseMessagingVolume } from "./analytics";

describe("messaging analytics", () => {
  it("groups volume by day without exposing message bodies", () => {
    const summary = summariseMessagingVolume([
      {
        created_at: "2026-11-17T10:00:00Z",
        conversation_id: "a",
      },
      {
        created_at: "2026-11-17T11:00:00Z",
        conversation_id: "a",
      },
      {
        created_at: "2026-11-18T09:00:00Z",
        conversation_id: "b",
      },
    ]);
    expect(summary).toEqual([
      { day: "2026-11-17", conversationCount: 1, messageCount: 2 },
      { day: "2026-11-18", conversationCount: 1, messageCount: 1 },
    ]);
  });

  it("averages first response minutes", () => {
    expect(
      averageFirstResponseMinutes([
        { firstCustomerAt: "2026-11-17T10:00:00Z", firstStaffAt: "2026-11-17T10:30:00Z" },
        { firstCustomerAt: "2026-11-17T11:00:00Z", firstStaffAt: null },
      ]),
    ).toBe(30);
  });
});
