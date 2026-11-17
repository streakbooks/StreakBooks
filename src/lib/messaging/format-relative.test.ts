import { describe, expect, it } from "vitest";
import { formatMessagingRelativeTime } from "./format-relative";

describe("formatMessagingRelativeTime", () => {
  const now = new Date("2026-11-17T12:00:00.000Z");

  it("returns empty for missing/invalid", () => {
    expect(formatMessagingRelativeTime(null, now)).toBe("");
    expect(formatMessagingRelativeTime("not-a-date", now)).toBe("");
  });

  it("formats recent and older timestamps", () => {
    expect(formatMessagingRelativeTime("2026-11-17T11:59:30.000Z", now)).toMatch(/second|now|ago/i);
    expect(formatMessagingRelativeTime("2026-11-17T10:00:00.000Z", now)).toMatch(/hour/i);
    expect(formatMessagingRelativeTime("2026-11-10T12:00:00.000Z", now)).toMatch(/day|Nov|10/i);
  });
});
