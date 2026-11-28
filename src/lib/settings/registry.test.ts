import { describe, expect, it } from "vitest";
import { SETTINGS_NAV_GROUPS } from "./nav-groups";
import { SETTINGS_CATEGORIES } from "./categories";
import { categoryMeta, resolveSettingsCategory, searchSettings } from "./registry";

describe("Settings Centre category routing and search", () => {
  it("maps every category to a navigation group", () => {
    const grouped = new Set(SETTINGS_NAV_GROUPS.flatMap((g) => g.ids));
    for (const id of SETTINGS_CATEGORIES) {
      expect(grouped.has(id), id).toBe(true);
    }
  });

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
    expect(searchSettings("late-fee grace period").some((item) => item.id === "sales")).toBe(true);
    expect(searchSettings("account code padding").some((item) => item.id === "accounting")).toBe(
      true,
    );
  });
  it("provides real workspace destinations for import, fixed assets and payroll", () => {
    const importMeta = categoryMeta.find((item) => item.id === "import_migration");
    const assetsMeta = categoryMeta.find((item) => item.id === "fixed_assets");
    const payrollMeta = categoryMeta.find((item) => item.id === "payroll");
    expect(importMeta?.moduleLinks).toContainEqual({
      label: "Data Import Centre",
      to: "/imports",
    });
    expect(assetsMeta?.moduleLinks).toContainEqual({
      label: "Fixed Assets workspace",
      to: "/fixed-assets",
    });
    expect(assetsMeta?.availability).toBe("partial");
    expect(payrollMeta?.moduleLinks).toContainEqual({
      label: "Payroll settings",
      to: "/payroll/settings",
    });
    expect(payrollMeta?.availability).toBe("partial");
  });

  it("routes Point of Sale setup from its own Settings category", () => {
    const posMeta = categoryMeta.find((item) => item.id === "pos");
    expect(posMeta?.availability).toBe("partial");
    expect(posMeta?.description).toContain("Tax and tender configuration are not available yet.");
    expect(posMeta?.moduleLinks).toEqual([
      { label: "Registers & sessions", to: "/pos/registers" },
      { label: "Catalogue checkout", to: "/pos" },
    ]);
    expect(searchSettings("cash drawer").some((item) => item.id === "pos")).toBe(true);
  });

  it("finds the existing nonprofit setup from a restricted fund search", () => {
    const nonprofit = searchSettings("restricted funds").find((item) => item.id === "nonprofit");
    expect(nonprofit?.moduleLinks).toEqual([
      { label: "Fund accounting setup", to: "/nonprofit/settings" },
    ]);
  });

  it("never strands users in categories without an editable Settings Centre schema", () => {
    for (const category of [
      "contacts",
      "expenses",
      "import_migration",
      "accountant",
      "fixed_assets",
      "payroll",
      "tax",
      "pos",
    ] as const) {
      const meta = categoryMeta.find((item) => item.id === category);
      expect(meta?.moduleLinks?.length, category).toBeGreaterThan(0);
      expect(
        meta?.moduleLinks?.every((item) => item.to.startsWith("/")),
        category,
      ).toBe(true);
    }
  });
});
