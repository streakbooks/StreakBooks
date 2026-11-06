import { describe, expect, it } from "vitest";
import {
  defaultBookingSettings,
  defaultWorkingWeek,
  generateAvailableSlots,
  overlaps,
} from "@/lib/advisors/booking-slots";

describe("advisors booking slots", () => {
  it("detects interval overlap", () => {
    const a0 = new Date("2026-11-10T09:00:00.000Z");
    const a1 = new Date("2026-11-10T09:30:00.000Z");
    const b0 = new Date("2026-11-10T09:15:00.000Z");
    const b1 = new Date("2026-11-10T09:45:00.000Z");
    expect(overlaps(a0, a1, b0, b1)).toBe(true);
    expect(overlaps(a0, a1, a1, b1)).toBe(false);
  });

  it("generates weekday slots and skips weekends", () => {
    const monday = new Date(Date.UTC(2026, 10, 9)); // Mon
    const sunday = new Date(Date.UTC(2026, 10, 8));
    const now = new Date("2026-11-01T00:00:00.000Z");
    const mondaySlots = generateAvailableSlots({
      day: monday,
      timeZone: "UTC",
      workingHours: defaultWorkingWeek(),
      settings: defaultBookingSettings(),
      busy: [],
      exceptions: [],
      now,
    });
    const sundaySlots = generateAvailableSlots({
      day: sunday,
      timeZone: "UTC",
      workingHours: defaultWorkingWeek(),
      settings: defaultBookingSettings(),
      busy: [],
      exceptions: [],
      now,
    });
    expect(sundaySlots).toHaveLength(0);
    expect(mondaySlots.length).toBeGreaterThan(0);
    expect(mondaySlots[0]?.durationMinutes).toBe(30);
  });

  it("excludes busy appointments including buffer", () => {
    const monday = new Date(Date.UTC(2026, 10, 9));
    const now = new Date("2026-11-01T00:00:00.000Z");
    const open = generateAvailableSlots({
      day: monday,
      timeZone: "UTC",
      workingHours: defaultWorkingWeek(),
      settings: defaultBookingSettings(),
      busy: [],
      exceptions: [],
      now,
    });
    const blockedStart = open[0]!.startsAt;
    const blocked = generateAvailableSlots({
      day: monday,
      timeZone: "UTC",
      workingHours: defaultWorkingWeek(),
      settings: defaultBookingSettings(),
      busy: [
        {
          startsAt: blockedStart,
          endsAt: new Date(blockedStart.getTime() + 30 * 60_000),
        },
      ],
      exceptions: [],
      now,
    });
    expect(blocked.some((slot) => slot.startsAt.getTime() === blockedStart.getTime())).toBe(false);
    expect(blocked.length).toBe(open.length - 1);
  });

  it("respects notice period so near-term slots are not offered", () => {
    const monday = new Date(Date.UTC(2026, 10, 9));
    const now = new Date("2026-11-09T08:00:00.000Z");
    const slots = generateAvailableSlots({
      day: monday,
      timeZone: "UTC",
      workingHours: defaultWorkingWeek(),
      settings: { ...defaultBookingSettings(), noticeHours: 24 },
      busy: [],
      exceptions: [],
      now,
    });
    expect(slots.every((slot) => slot.startsAt.getTime() >= now.getTime() + 24 * 3_600_000)).toBe(
      true,
    );
  });
});
