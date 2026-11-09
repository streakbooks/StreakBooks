import { describe, expect, it } from "vitest";
import { resolveCrmAutomationPolicy } from "@/lib/crm/automation-policy";

describe("resolveCrmAutomationPolicy", () => {
  it("fails closed by default", () => {
    const policy = resolveCrmAutomationPolicy();
    expect(policy.engineEnabled).toBe(false);
    expect(policy.canRun).toBe(false);
    expect(policy.canCreateRules).toBe(false);
  });

  it("allows rules only when engineEnabled is true", () => {
    const policy = resolveCrmAutomationPolicy({ engineEnabled: true });
    expect(policy.canRun).toBe(true);
    expect(policy.engineEnabled).toBe(true);
  });
});
