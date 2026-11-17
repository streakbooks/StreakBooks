import { describe, expect, it } from "vitest";
import {
  isValidMessagingRetentionDays,
  messagesPastRetention,
  messagingRetentionLabel,
  resolveMessagingRetentionPurgeMode,
} from "./retention";

describe("messaging retention", () => {
  it("validates retention windows", () => {
    expect(isValidMessagingRetentionDays(null)).toBe(true);
    expect(isValidMessagingRetentionDays(30)).toBe(true);
    expect(isValidMessagingRetentionDays(29)).toBe(false);
  });

  it("keeps purge execute fail-closed", () => {
    expect(resolveMessagingRetentionPurgeMode({ execute: true })).toBe("dry_run");
  });

  it("labels and detects expired messages without deleting", () => {
    expect(messagingRetentionLabel(90)).toContain("90");
    expect(
      messagesPastRetention({
        createdAt: "2020-01-01T00:00:00Z",
        retentionDays: 30,
        now: new Date("2026-11-17T00:00:00Z"),
      }),
    ).toBe(true);
    expect(
      messagesPastRetention({
        createdAt: "2026-11-16T00:00:00Z",
        retentionDays: null,
        now: new Date("2026-11-17T00:00:00Z"),
      }),
    ).toBe(false);
  });
});
