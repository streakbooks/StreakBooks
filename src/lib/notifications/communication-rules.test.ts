import { describe, expect, it } from "vitest";
import {
  emailWithVerifiedSender,
  inQuietHours,
  isValidReplyTo,
  safeSenderName,
  validHourMinute,
} from "./communication-rules";

describe("communication sender identity", () => {
  it("keeps the server-verified sender address while using a safe display name", () => {
    expect(emailWithVerifiedSender("StreakBooks <verified@streakbooks.com>", "Accounts Team")).toBe(
      "Accounts Team <verified@streakbooks.com>",
    );
    expect(emailWithVerifiedSender("verified@streakbooks.com", "Ops")).toBe(
      "Ops <verified@streakbooks.com>",
    );
  });
  it("rejects invalid server sender values and strips header injection from names", () => {
    expect(() => emailWithVerifiedSender("malformed-from", "Accounts")).toThrow();
    expect(safeSenderName("Finance\r\nBcc: evil@invalid.test")).not.toContain("\n");
    expect(safeSenderName("Finance <Team>")).toBe("Finance Team");
  });
  it("validates reply-to and time values", () => {
    expect(isValidReplyTo("accounts@example.com")).toBe(true);
    expect(isValidReplyTo("")).toBe(true);
    expect(isValidReplyTo("evil\r\nBcc: x@y.com")).toBe(false);
    expect(validHourMinute("23:59")).toBe(true);
    expect(validHourMinute("24:00")).toBe(false);
  });
});

describe("organisation quiet hours", () => {
  const config = {
    quiet_hours_enabled: true,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
  };
  it("observes overnight company-local time instead of UTC", () => {
    expect(inQuietHours(config, "Asia/Kolkata", new Date("2026-10-31T18:00:00Z"))).toBe(true);
    expect(inQuietHours(config, "Asia/Kolkata", new Date("2026-10-31T06:00:00Z"))).toBe(false);
  });
  it("supports same-day windows and disabling", () => {
    const daytime = { ...config, quiet_hours_start: "09:00", quiet_hours_end: "17:00" };
    expect(inQuietHours(daytime, "UTC", new Date("2026-10-31T12:00:00Z"))).toBe(true);
    expect(inQuietHours(daytime, "UTC", new Date("2026-10-31T18:00:00Z"))).toBe(false);
    expect(inQuietHours({ ...config, quiet_hours_enabled: false }, "UTC")).toBe(false);
  });
  it("does not block all-day for equal times", () => {
    expect(inQuietHours({ ...config, quiet_hours_end: "22:00" }, "UTC")).toBe(false);
  });
});
