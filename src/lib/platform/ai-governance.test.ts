import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { governAiQuery } from "./ai-governance";

describe("AI governance", () => {
  it("stops a kill switch before the cap", () => {
    expect(
      governAiQuery({
        role: "platform_owner",
        source: "kill_switch",
        allowed: false,
        cap: 100,
        used: 1,
        unitCostMinor: null,
      }),
    ).toEqual({ status: "killed", allowed: false, spendMinor: null, providerCalled: false });
  });

  it("caps usage and leaves a missing price unpriced", () => {
    expect(
      governAiQuery({
        role: "platform_owner",
        source: "plan",
        allowed: true,
        cap: 10,
        used: 10,
        unitCostMinor: null,
      }).status,
    ).toBe("capped");
    expect(
      governAiQuery({
        role: "platform_owner",
        source: "plan",
        allowed: true,
        cap: null,
        used: 0,
        unitCostMinor: 25,
      }),
    ).toEqual({ status: "no_cap", allowed: true, spendMinor: 0, providerCalled: false });
  });

  it("refuses finance and keeps the read unapplied", () => {
    expect(() =>
      governAiQuery({
        role: "platform_finance",
        source: "plan",
        allowed: true,
        cap: null,
        used: 0,
        unitCostMinor: null,
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102230000_ai_governance.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("private.require_platform('features.view')");
    expect(sql).not.toContain("ai_usage_events");
  });
});
