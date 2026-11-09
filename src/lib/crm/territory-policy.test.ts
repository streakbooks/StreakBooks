import { describe, expect, it } from "vitest";
import { resolveCrmTerritoryPolicy } from "@/lib/crm/territory-policy";

describe("resolveCrmTerritoryPolicy", () => {
  it("fails closed by default", () => {
    const policy = resolveCrmTerritoryPolicy();
    expect(policy.canManageTerritories).toBe(false);
  });

  it("allows manage when backendReady", () => {
    expect(resolveCrmTerritoryPolicy({ backendReady: true }).canManageTerritories).toBe(true);
  });
});
