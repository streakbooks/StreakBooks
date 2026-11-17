import { describe, expect, it } from "vitest";
import { shouldShowMessagingDesktopNotification } from "./desktop-notify";

describe("messaging desktop notifications", () => {
  it("requires granted permission and a hidden document", () => {
    expect(
      shouldShowMessagingDesktopNotification({
        permission: "granted",
        documentHidden: true,
        pushEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldShowMessagingDesktopNotification({
        permission: "granted",
        documentHidden: false,
        pushEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMessagingDesktopNotification({
        permission: "denied",
        documentHidden: true,
        pushEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMessagingDesktopNotification({
        permission: "granted",
        documentHidden: true,
        pushEnabled: false,
      }),
    ).toBe(false);
  });

  it("suppresses during quiet hours", () => {
    const night = new Date(2026, 10, 17, 23, 15, 0);
    expect(
      shouldShowMessagingDesktopNotification({
        permission: "granted",
        documentHidden: true,
        pushEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: night,
      }),
    ).toBe(false);
  });
});
