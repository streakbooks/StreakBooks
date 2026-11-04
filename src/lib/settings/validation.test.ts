import { describe, expect, it } from "vitest";
import { parseExpectedSettingsVersion } from "./validation";

describe("Settings Centre concurrency version validation", () => {
  it("allows omitted legacy versions and valid zero-based versions", () => {
    expect(parseExpectedSettingsVersion(undefined)).toBeNull();
    expect(parseExpectedSettingsVersion(null)).toBeNull();
    expect(parseExpectedSettingsVersion(0)).toBe(0);
    expect(parseExpectedSettingsVersion(12)).toBe(12);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "0", "", true, {}, []])(
    "rejects an invalid expected version: %s",
    (value) => {
      expect(() => parseExpectedSettingsVersion(value)).toThrow("Invalid settings version");
    },
  );
});
