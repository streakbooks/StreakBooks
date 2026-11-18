import { describe, it, expect } from "vitest";
import {
  openSettingsPanel,
  closeSettingsPanel,
  parseSettingsPanel,
  validateSettingsPanelSearch,
  panelForDestination,
  settingsPanelTrail,
} from "./panels";
describe("in-place settings routing", () => {
  it("retains record filters and source category while opening and closing a panel", () => {
    const original = { section: "purchases", status: "draft", bankAccountId: "bank", page: 3 };
    const opened = openSettingsPanel(original, "supplier-defaults");
    expect(opened).toEqual({ ...original, settingsPanel: "supplier-defaults" });
    expect(closeSettingsPanel(opened)).toEqual(original);
    expect(original).not.toHaveProperty("settingsPanel");
  });
  it("returns to the parent settings panel for nested settings and keeps refreshable history", () => {
    const parent = openSettingsPanel({ status: "uncategorised" }, "category:banking");
    const child = openSettingsPanel(parent, "bank-rules");
    expect(child).toMatchObject({
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking"],
    });
    expect(closeSettingsPanel(child)).toEqual(parent);
    expect(closeSettingsPanel(parent)).toEqual({ status: "uncategorised" });
  });
  it("cuts cycles and bounds nested settings navigation", () => {
    const first = openSettingsPanel({}, "category:banking");
    const second = openSettingsPanel(first, "bank-rules");
    expect(openSettingsPanel(second, "category:banking")).toEqual(first);
    expect(settingsPanelTrail(Array(9).fill("branding"))).toEqual([]);
  });
  it("never turns query strings into component paths or external return URLs", () => {
    for (const input of [
      "https://example.invalid",
      "../../admin",
      "category:unknown",
      "javascript:alert(1)",
      null,
      {},
      ["branding"],
    ])
      expect(parseSettingsPanel(input)).toBeUndefined();
    expect(
      validateSettingsPanelSearch({ settingsPanel: "bank-rules", settingsTrail: ["../../admin"] }),
    ).toEqual({ settingsPanel: "bank-rules" });
    expect(validateSettingsPanelSearch({ settingsPanel: "unknown" })).toEqual({});
  });
  it("does not resurrect stale nested panels when the active panel is absent or untrusted", () => {
    const stale = { section: "banking", settingsTrail: ["category:banking"], status: "draft" };
    expect(closeSettingsPanel(stale)).toEqual({ section: "banking", status: "draft" });
    expect(closeSettingsPanel({ ...stale, settingsPanel: "../../admin" })).toEqual({
      section: "banking", status: "draft",
    });
    expect(closeSettingsPanel({ ...stale, settingsPanel: "bank-rules" })).toEqual({
      section: "banking", settingsPanel: "category:banking", status: "draft",
    });
  });
  it("drops orphaned trails when opening a panel from an invalid or missing current panel", () => {
    const orphaned = { section: "banking", status: "draft", settingsTrail: ["category:banking"] };
    expect(openSettingsPanel(orphaned, "bank-rules")).toEqual({
      section: "banking", status: "draft", settingsPanel: "bank-rules",
    });
    expect(openSettingsPanel({ ...orphaned, settingsPanel: "../../admin" }, "bank-rules")).toEqual({
      section: "banking", status: "draft", settingsPanel: "bank-rules",
    });
    const parent = openSettingsPanel({}, "category:banking");
    const child = openSettingsPanel(parent, "bank-rules");
    expect(openSettingsPanel(child, "bank-rules")).toEqual(child);
    expect(closeSettingsPanel(child)).toEqual(parent);
  });
  it("never returns to the current panel from a malformed deep-link trail", () => {
    const malformed = {
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking", "bank-rules"],
    };
    expect(closeSettingsPanel(malformed)).toEqual({
      section: "banking",
      settingsPanel: "category:banking",
    });
    expect(closeSettingsPanel({
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["bank-rules"],
    })).toEqual({ section: "banking" });
  });
  it("removes self-referential trail entries before opening another panel", () => {
    const malformed = {
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking", "bank-rules"] as string[],
    };
    const opened = openSettingsPanel(malformed, "bank-feeds");
    expect(opened).toEqual({
      section: "banking",
      settingsPanel: "bank-feeds",
      settingsTrail: ["category:banking", "bank-rules"],
    });
    expect(closeSettingsPanel(opened)).toEqual({
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking"],
    });
    expect(openSettingsPanel(malformed, "bank-rules")).toEqual({
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking"],
    });
  });
  it("sanitizes self-referential Settings history on deep-link refresh", () => {
    expect(validateSettingsPanelSearch({
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking", "bank-rules"],
    })).toEqual({ settingsPanel: "bank-rules", settingsTrail: ["category:banking"] });
    expect(validateSettingsPanelSearch({
      settingsPanel: "bank-rules", settingsTrail: ["bank-rules"],
    })).toEqual({ settingsPanel: "bank-rules" });
  });
  it("removes duplicate ancestors from malformed refreshable and interactive trails", () => {
    const malformed = {
      section: "banking",
      settingsPanel: "bank-rules",
      settingsTrail: ["category:banking", "branding", "category:banking"] as string[],
    };
    expect(validateSettingsPanelSearch(malformed)).toEqual({
      settingsPanel: "bank-rules",
      settingsTrail: ["branding", "category:banking"],
    });
    expect(closeSettingsPanel(malformed)).toEqual({
      section: "banking",
      settingsPanel: "category:banking",
      settingsTrail: ["branding"],
    });
    expect(openSettingsPanel(malformed, "bank-feeds")).toEqual({
      section: "banking",
      settingsPanel: "bank-feeds",
      settingsTrail: ["branding", "category:banking", "bank-rules"],
    });
  });
  it("resolves shared settings to panels and leaves transactional routes alone", () => {
    expect(panelForDestination({ to: "/contacts/settings", panel: "supplier-defaults" })).toBe(
      "supplier-defaults",
    );
    expect(panelForDestination({ to: "/settings", section: "documents" })).toBe("numbering");
    expect(panelForDestination({ to: "/banking/rules" })).toBe("bank-rules");
    expect(panelForDestination({ to: "/purchases/bills/new" })).toBeUndefined();
    expect(panelForDestination({ to: "/settings", section: "unknown" as never })).toBeUndefined();
    expect(panelForDestination({ to: "/settings", section: "../../admin" as never })).toBeUndefined();
    expect(panelForDestination({ to: "/settings", section: "banking" })).toBe("category:banking");
    // A malformed runtime descriptor must not bypass the panel allowlist.
    expect(panelForDestination({ to: "/settings", panel: "javascript:alert(1)" as never })).toBeUndefined();
    expect(panelForDestination({ to: "/settings", panel: "category:unknown" as never })).toBeUndefined();
  });
  it("rejects invalid runtime panel targets without mutating URL state", () => {
    const current = { section: "banking", settingsPanel: "bank-rules", settingsTrail: ["category:banking"], page: 2 };
    for (const target of ["category:unknown", "../../admin", "javascript:alert(1)", "", null, ["branding"]]) {
      expect(openSettingsPanel(current, target as never)).toEqual(current);
    }
    expect(openSettingsPanel(current, "bank-feeds")).toEqual({
      ...current, settingsPanel: "bank-feeds", settingsTrail: ["category:banking", "bank-rules"],
    });
  });
  it("writes only validated panel IDs and preserves unrelated query parameters", () => {
    const original = { section: "banking", status: "draft", page: 4, settingsPanel: "bank-rules" };
    const opened = openSettingsPanel(original, "bank-feeds");
    expect(opened).toEqual({
      ...original, settingsPanel: "bank-feeds", settingsTrail: ["bank-rules"],
    });
    expect(validateSettingsPanelSearch(opened)).toEqual({
      settingsPanel: "bank-feeds", settingsTrail: ["bank-rules"],
    });
    expect(closeSettingsPanel(opened)).toEqual(original);
  });
  it("rejects sparse Settings history instead of retaining undefined ancestors", () => {
    const sparse = new Array<string>(2);
    sparse[1] = "category:banking";
    expect(settingsPanelTrail(sparse)).toEqual([]);
    expect(validateSettingsPanelSearch({
      settingsPanel: "bank-rules",
      settingsTrail: sparse,
    })).toEqual({ settingsPanel: "bank-rules" });
    expect(openSettingsPanel({
      settingsPanel: "bank-rules",
      settingsTrail: sparse,
    }, "bank-feeds")).toEqual({
      settingsPanel: "bank-feeds",
      settingsTrail: ["bank-rules"],
    });
  });
  it("rejects inherited array slots in Settings history", () => {
    const inherited = new Array<string>(2);
    inherited[1] = "bank-rules";
    Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: "category:banking" }));
    expect(settingsPanelTrail(inherited)).toEqual([]);
    expect(validateSettingsPanelSearch({
      settingsPanel: "bank-feeds",
      settingsTrail: inherited,
    })).toEqual({ settingsPanel: "bank-feeds" });
  });

});
