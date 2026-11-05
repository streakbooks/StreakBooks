import { describe, expect, it } from "vitest";
import { ACCOUNTANT_WORKSPACE_TABS, parseAccountantWorkspaceTab } from "./workspace-navigation";

describe("accountant workspace navigation", () => {
  it("exposes seven distinct, named workspaces", () => {
    expect(new Set(ACCOUNTANT_WORKSPACE_TABS.map((tab) => tab.id)).size).toBe(7);
    expect(ACCOUNTANT_WORKSPACE_TABS.every((tab) => tab.label.length > 0)).toBe(true);
  });

  it("accepts every supported deep-link and safely defaults invalid values", () => {
    for (const tab of ACCOUNTANT_WORKSPACE_TABS)
      expect(parseAccountantWorkspaceTab(tab.id)).toBe(tab.id);
    for (const invalid of [undefined, null, "", "missing", {}, 12, ["journals"]])
      expect(parseAccountantWorkspaceTab(invalid)).toBe("overview");
  });
});
