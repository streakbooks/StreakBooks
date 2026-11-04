import { describe, expect, it } from "vitest";
import { assertSettingsBoolean, parseExpectedSettingsVersion } from "./validation";

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
