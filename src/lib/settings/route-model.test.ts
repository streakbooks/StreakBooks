import { describe, expect, it } from "vitest";
import { SETTINGS_CATEGORIES } from "./categories";
import {
  resolveSettingsRoute,
  settingsRouteForLegacyPath,
  settingsRouteForPanel,
  settingsRouteForSection,
} from "./route-model";

describe("canonical Settings routes", () => {
  it("provides a refreshable overview route for every registered category", () => {
    for (const section of SETTINGS_CATEGORIES) {
      const route = settingsRouteForSection(section);
      expect(resolveSettingsRoute(route.group, route.page), section).toMatchObject({
        section,
      });
    }
  });

  it("maps legacy module destinations to their existing canonical setting page", () => {
    expect(settingsRouteForLegacyPath("/sales/settings")).toEqual({
      group: "sales",
      page: "defaults",
    });
    expect(settingsRouteForLegacyPath("/documents/branding")).toEqual({
      group: "documents",
      page: "branding",
    });
    expect(settingsRouteForLegacyPath("/unsupported/settings")).toBeUndefined();
  });

  it("resolves nested forms and rejects unknown groups or page slugs", () => {
    expect(resolveSettingsRoute("sales", "reminders")).toMatchObject({
      section: "sales",
      panel: "reminders",
      pageLabel: "Invoice reminders",
    });
    expect(resolveSettingsRoute("sales", "not-a-setting")).toBeUndefined();
    expect(resolveSettingsRoute("../../auth", "overview")).toBeUndefined();
  });

  it("maps existing in-place panels to canonical routes", () => {
    expect(settingsRouteForPanel("bank-feeds")).toEqual({ group: "banking", page: "feeds" });
    expect(settingsRouteForPanel("category:users")).toEqual({
      group: "users",
      page: "overview",
    });
  });
});
