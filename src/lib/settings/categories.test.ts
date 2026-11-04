import { describe, expect, it } from "vitest";
import { assertSettingsCategory, SETTINGS_CATEGORIES } from "./categories";

describe("Settings Centre category boundary", () => {
  it("accepts every registered category", () => {
    for (const category of SETTINGS_CATEGORIES) {
      expect(assertSettingsCategory(category)).toBe(category);
    }
  });

  it.each([undefined, null, "", "unknown", "custom_category", "accounting ", 123, {}, []])(
    "rejects an unregistered category: %s",
    (value) => {
      expect(() => assertSettingsCategory(value)).toThrow("Unknown settings category");
    },
  );

  it("does not silently truncate unsupported category names", () => {
    expect(() => assertSettingsCategory("accounting".repeat(20))).toThrow(
      "Unknown settings category",
    );
  });
});
