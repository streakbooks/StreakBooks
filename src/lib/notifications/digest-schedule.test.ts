import { describe, expect, it } from "vitest";
import { scheduleIsDue } from "./digest-schedule";
const quiet = { quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00" };
describe("scheduled digest time gates", () => {
  it("evaluates hourly execution in organisation local time", () => {
    const now = new Date("2026-11-02T02:05:00Z"); // 07:35 Kolkata, Monday
    expect(
      scheduleIsDue({ frequency: "daily", weekday: 1, hour_local: 7 }, "Asia/Kolkata", quiet, now),
    ).toBe(true);
    expect(
      scheduleIsDue({ frequency: "daily", weekday: 1, hour_local: 8 }, "Asia/Kolkata", quiet, now),
    ).toBe(false);
  });
  it("respects weekly weekday and local hour", () => {
    const now = new Date("2026-11-02T02:05:00Z");
    expect(
      scheduleIsDue({ frequency: "weekly", weekday: 1, hour_local: 7 }, "Asia/Kolkata", quiet, now),
    ).toBe(true);
    expect(
      scheduleIsDue({ frequency: "weekly", weekday: 2, hour_local: 7 }, "Asia/Kolkata", quiet, now),
    ).toBe(false);
  });
  it("quiet hours prevent scheduled delivery", () => {
    const now = new Date("2026-11-02T02:05:00Z");
    expect(
      scheduleIsDue(
        { frequency: "daily", weekday: 1, hour_local: 7 },
        "Asia/Kolkata",
        {
          ...quiet,
          quiet_hours_enabled: true,
          quiet_hours_start: "06:00",
          quiet_hours_end: "08:00",
        },
        now,
      ),
    ).toBe(false);
  });
  it("off is never due", () => {
    expect(
      scheduleIsDue({ frequency: "off", weekday: 0, hour_local: 12 }, "UTC", quiet, new Date()),
    ).toBe(false);
  });
});
