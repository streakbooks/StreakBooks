import { describe, expect, it } from "vitest";
import {
  assertMessagingExternalPortalsAllowed,
  messagingExternalPortalsUnlocked,
} from "./external-portals";

describe("messaging external portals kill-switch", () => {
  it("is locked by default", () => {
    expect(messagingExternalPortalsUnlocked({})).toBe(false);
    expect(messagingExternalPortalsUnlocked({ MESSAGING_EXTERNAL_PORTALS_ENABLED: "0" })).toBe(
      false,
    );
    expect(messagingExternalPortalsUnlocked({ MESSAGING_EXTERNAL_PORTALS_ENABLED: "1" })).toBe(
      true,
    );
  });

  it("blocks enabling customer/vendor when locked", () => {
    expect(() => assertMessagingExternalPortalsAllowed({ allowCustomer: true }, {})).toThrow(
      /locked/i,
    );
    expect(() => assertMessagingExternalPortalsAllowed({ allowVendor: true }, {})).toThrow(
      /locked/i,
    );
    expect(() =>
      assertMessagingExternalPortalsAllowed({ allowCustomer: false, allowVendor: false }, {}),
    ).not.toThrow();
    expect(() =>
      assertMessagingExternalPortalsAllowed(
        { allowCustomer: true },
        { MESSAGING_EXTERNAL_PORTALS_ENABLED: "1" },
      ),
    ).not.toThrow();
  });
});
