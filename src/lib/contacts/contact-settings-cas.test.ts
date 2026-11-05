import { describe, expect, it } from "vitest";
import {
  CONTACT_SETTINGS_CONFLICT_MESSAGE,
  nextContactSettingsRevision,
  parseContactSettingsRevision,
} from "./contact-settings-cas";

describe("Contact settings optimistic concurrency", () => {
  it("allows a first-time save only with an explicit null revision", () => {
    expect(parseContactSettingsRevision(null)).toBeNull();
    expect(() => parseContactSettingsRevision(undefined)).toThrow();
  });

  it("accepts PostgreSQL UTC timestamps with microseconds", () => {
    expect(parseContactSettingsRevision("2026-11-05T05:31:30.123456+00:00")).toBe(
      "2026-11-05T05:31:30.123456+00:00",
    );
    expect(parseContactSettingsRevision("2026-11-05T05:31:30Z")).toBe("2026-11-05T05:31:30Z");
  });

  it.each(["", "not-a-date", "2026-13-05", "now()", "2026-11-05T12:01:00Z;drop", 0])(
    "rejects unsafe or invalid revision %s",
    (revision) => {
      expect(() => parseContactSettingsRevision(revision)).toThrow();
    },
  );

  it("always creates a newer revision even if the clock goes backwards", () => {
    const previous = "2026-11-05T05:31:30.123456+00:00";
    const next = nextContactSettingsRevision(previous, Date.parse(previous) - 5000);
    expect(Date.parse(next)).toBeGreaterThan(Date.parse(previous));
  });

  it("returns a valid first revision for a new organisation", () => {
    expect(nextContactSettingsRevision(null, 1_800_000_000_000)).toBe("2027-01-15T08:00:00.000Z");
  });

  it("offers a safe refresh instruction for conflicting writes", () => {
    expect(CONTACT_SETTINGS_CONFLICT_MESSAGE).toContain("Reload latest values");
  });
});
