import { describe, expect, it } from "vitest";
import {
  assertSettingsBoolean,
  parseExpectedSettingsVersion,
  parseOptionalLockDate,
  parseOptionalOverrideReason,
} from "./validation";

describe("Settings Centre concurrency version validation", () => {
  it("allows omitted legacy versions and valid zero-based versions", () => {
    expect(parseExpectedSettingsVersion(undefined)).toBeNull();
    expect(parseExpectedSettingsVersion(null)).toBeNull();
    expect(parseExpectedSettingsVersion(0)).toBe(0);
    expect(parseExpectedSettingsVersion(12)).toBe(12);
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "0",
    "",
    true,
    {},
    [],
  ])("rejects an invalid expected version: %s", (value) => {
    expect(() => parseExpectedSettingsVersion(value)).toThrow("Invalid settings version");
  });
});

describe("Settings Centre feature flag validation", () => {
  it("preserves explicit boolean flags", () => {
    expect(assertSettingsBoolean(true)).toBe(true);
    expect(assertSettingsBoolean(false)).toBe(false);
  });

  it.each(["false", "true", 0, 1, null, undefined, {}, []])(
    "rejects unsafe boolean coercion: %s",
    (value) => {
      expect(() => assertSettingsBoolean(value)).toThrow("Invalid settings boolean");
    },
  );
});

describe("Settings Centre lock policy input validation", () => {
  it("accepts only real ISO dates and intentional empty values", () => {
    expect(parseOptionalLockDate(undefined)).toBeNull();
    expect(parseOptionalLockDate(null)).toBeNull();
    expect(parseOptionalLockDate("")).toBeNull();
    expect(parseOptionalLockDate("2024-02-29")).toBe("2024-02-29");
    expect(parseOptionalLockDate("2026-11-04")).toBe("2026-11-04");
  });

  it.each([
    "2025-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "0000-01-01",
    "2026-1-01",
    "04/11/2026",
    "2026-11-04T00:00:00Z",
    0,
    true,
    {},
  ])("rejects malformed or impossible dates: %s", (value) => {
    expect(() => parseOptionalLockDate(value)).toThrow("Invalid lock policy date");
  });

  it("defaults override reasons only when truly omitted", () => {
    expect(parseOptionalOverrideReason(undefined)).toBe(true);
    expect(parseOptionalOverrideReason(true)).toBe(true);
    expect(parseOptionalOverrideReason(false)).toBe(false);
  });

  it.each([null, "false", "true", 0, 1, ""])(
    "rejects unsafe override reason coercion: %s",
    (value) => {
      expect(() => parseOptionalOverrideReason(value)).toThrow("Invalid settings boolean");
    },
  );
});
