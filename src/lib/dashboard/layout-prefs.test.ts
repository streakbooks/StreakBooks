import { describe, expect, it } from "vitest";
import {
  ALL_WIDGET_IDS,
  DASHBOARD_PRESETS,
  dashboardLayoutStorageKey,
  defaultDashboardLayout,
  moveWidget,
  readDashboardLayout,
  saveDashboardLayout,
  sanitiseWidgetIds,
  setWidgetVisible,
  shiftWidget,
} from "./layout-prefs";

describe("dashboard layout preferences", () => {
  it("uses all real available widgets by default, without storing financial data", () => {
    expect(defaultDashboardLayout().widgets).toEqual(ALL_WIDGET_IDS);
    expect(readDashboardLayout(null)).toEqual(defaultDashboardLayout());
    expect(readDashboardLayout("{not JSON")).toEqual(defaultDashboardLayout());
  });

  it("filters unknown identifiers, duplicates and unsafe saved view names", () => {
    const stored = readDashboardLayout(
      JSON.stringify({
        widgets: ["payables", "payables", "fake-widget", "bank-accounts"],
        compact: true,
        saved: [
          { name: "  My  review  ", widgets: ["tasks", "cash-flow", "bogus"], compact: true },
          { name: "my review", widgets: ["profit"], compact: false },
          { name: "Banking", widgets: ["bank-accounts"], compact: false },
        ],
        amounts: [1000, 2000],
      }),
    );
    expect(stored.widgets).toEqual(["payables", "bank-accounts"]);
    expect(stored.saved).toEqual([
      { name: "My review", widgets: ["tasks", "cash-flow"], compact: true },
      { name: "Banking", widgets: ["bank-accounts"], compact: false },
    ]);
    expect(Object.keys(stored)).toEqual(["widgets", "compact", "saved"]);
  });

  it("supports hiding every widget and restoring one", () => {
    expect(sanitiseWidgetIds([])).toEqual([]);
    expect(setWidgetVisible(["cash-flow", "tasks"], "tasks", false)).toEqual(["cash-flow"]);
    expect(setWidgetVisible(["cash-flow"], "tasks", true)).toEqual(["cash-flow", "tasks"]);
    expect(setWidgetVisible(["cash-flow", "tasks"], "tasks", true)).toEqual(["cash-flow", "tasks"]);
  });

  it("reorders safely and ignores unknown or unavailable targets", () => {
    const current = ["cash-flow", "bank-accounts", "tasks"] as const;
    expect(moveWidget(current, "tasks", "cash-flow")).toEqual([
      "tasks",
      "cash-flow",
      "bank-accounts",
    ]);
    expect(shiftWidget(current, "bank-accounts", -1)).toEqual([
      "bank-accounts",
      "cash-flow",
      "tasks",
    ]);
    expect(shiftWidget(current, "bank-accounts", 1)).toEqual([
      "cash-flow",
      "tasks",
      "bank-accounts",
    ]);
    expect(shiftWidget(current, "cash-flow", -1)).toEqual(current);
    expect(moveWidget(current, "payables", "tasks")).toEqual(current);
  });

  it("saves, overwrites and caps named layouts without rewriting the current view", () => {
    const initial = defaultDashboardLayout();
    initial.widgets = ["cash-flow", "tasks"];
    const first = saveDashboardLayout(initial, "Daily");
    expect(first.saved[0]?.widgets).toEqual(["cash-flow", "tasks"]);
    const second = saveDashboardLayout(
      { ...first, widgets: ["bank-accounts"], compact: true },
      " daily ",
    );
    expect(second.saved).toHaveLength(1);
    expect(second.saved[0]).toEqual({ name: "daily", widgets: ["bank-accounts"], compact: true });
    expect(first.widgets).toEqual(["cash-flow", "tasks"]);
    let prefs = second;
    for (let i = 0; i < 20; i++) prefs = saveDashboardLayout(prefs, "View " + i);
    expect(prefs.saved).toHaveLength(8);
  });

  it("provides distinct presets and isolates users and organisations", () => {
    expect(DASHBOARD_PRESETS.map((p) => p.id)).toEqual([
      "overview",
      "collections",
      "payables",
      "banking",
    ]);
    expect(DASHBOARD_PRESETS.every((p) => p.ids.every((id) => ALL_WIDGET_IDS.includes(id)))).toBe(
      true,
    );
    expect(dashboardLayoutStorageKey("userA", "companyA")).not.toBe(
      dashboardLayoutStorageKey("userB", "companyA"),
    );
    expect(dashboardLayoutStorageKey("userA", "companyA")).not.toBe(
      dashboardLayoutStorageKey("userA", "companyB"),
    );
  });
});
