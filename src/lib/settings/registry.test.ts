import { describe, expect, it } from "vitest";
import { resolveSettingsCategory, searchSettings } from "./registry";

describe("Settings Centre category routing and search", () => {
  it("keeps valid deep links and falls back for invalid or unsafe categories", () => {
    expect(resolveSettingsCategory("notifications")).toBe("notifications");
    expect(resolveSettingsCategory("accounting")).toBe("accounting");
    expect(resolveSettingsCategory("does_not_exist")).toBe("overview");
    expect(resolveSettingsCategory("https://example.invalid")).toBe("overview");
    expect(resolveSettingsCategory(null)).toBe("overview");
    expect(resolveSettingsCategory(["sales"])).toBe("overview");
  });

  it("finds settings by human-friendly terms", () => {
    expect(searchSettings("closing date").some((item) => item.id === "accounting")).toBe(true);
    expect(searchSettings("mfa").some((item) => item.id === "users")).toBe(true);
    expect(searchSettings("bank feeds").some((item) => item.id === "banking")).toBe(true);
    expect(searchSettings("not-a-real-category-keyword")).toHaveLength(0);
  });
});
