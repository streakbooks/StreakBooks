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
  it("resolves shared settings to panels and leaves transactional routes alone", () => {
    expect(panelForDestination({ to: "/contacts/settings", panel: "supplier-defaults" })).toBe(
      "supplier-defaults",
    );
    expect(panelForDestination({ to: "/settings", section: "documents" })).toBe("numbering");
    expect(panelForDestination({ to: "/banking/rules" })).toBe("bank-rules");
    expect(panelForDestination({ to: "/purchases/bills/new" })).toBeUndefined();
  });
});
