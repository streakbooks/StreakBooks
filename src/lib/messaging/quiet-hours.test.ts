import { describe, expect, it } from "vitest";
import { isWithinMessagingQuietHours, parseMessagingQuietTime } from "./quiet-hours";

describe("messaging quiet hours", () => {
  it("parses HH:MM", () => {
    expect(parseMessagingQuietTime("09:30")).toBe(9 * 60 + 30);
    expect(parseMessagingQuietTime("bad")).toBeNull();
  });

  it("handles same-day and overnight windows", () => {
    const noon = new Date(2026, 10, 17, 12, 0, 0);
    const night = new Date(2026, 10, 17, 23, 0, 0);
    const morning = new Date(2026, 10, 17, 6, 0, 0);
    expect(isWithinMessagingQuietHours("09:00", "17:00", noon)).toBe(true);
    expect(isWithinMessagingQuietHours("09:00", "17:00", night)).toBe(false);
    expect(isWithinMessagingQuietHours("22:00", "07:00", night)).toBe(true);
    expect(isWithinMessagingQuietHours("22:00", "07:00", morning)).toBe(true);
    expect(isWithinMessagingQuietHours("22:00", "07:00", noon)).toBe(false);
    expect(isWithinMessagingQuietHours(null, "07:00", night)).toBe(false);
  });
});
