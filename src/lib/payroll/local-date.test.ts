import { describe, expect, it } from "vitest";
import { todayLocalDateOnly } from "./local-date";

describe("todayLocalDateOnly", () => {
  it("uses the local day at 23:59 rather than converting to a UTC calendar date", () => {
    expect(todayLocalDateOnly(new Date(2026, 9, 30, 23, 59, 59))).toBe("2026-10-30");
  });

  it("uses the next local calendar date immediately after midnight", () => {
    expect(todayLocalDateOnly(new Date(2026, 10, 1, 0, 0, 1))).toBe("2026-11-01");
  });

  it("supports a valid leap day", () => {
    expect(todayLocalDateOnly(new Date(2024, 1, 29, 12, 0))).toBe("2024-02-29");
  });
});
