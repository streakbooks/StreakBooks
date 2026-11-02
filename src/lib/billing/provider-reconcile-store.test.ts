import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileProviderCharges } from "./provider-reconcile";
import { planStoredReconciliation } from "./provider-reconcile-store";

describe("stored provider reconciliation", () => {
  it("does not persist a missing provider list as zero", () => {
    const result = reconcileProviderCharges({
      local: [{ id: "local-1", providerId: "ch_1", currency: "INR", amountMinor: 3000 }],
      provider: null,
    });
    expect(
      planStoredReconciliation({ role: "platform_finance", result, reason: "Month end" }),
    ).toEqual({ persist: false, providerCalled: false, state: "unrecorded" });
  });

  it("persists a match and refuses support", () => {
    const result = reconcileProviderCharges({
      local: [{ id: "local-1", providerId: "ch_1", currency: "INR", amountMinor: 3000 }],
      provider: [{ id: "ch_1", currency: "INR", amountMinor: 3000 }],
    });
    expect(
      planStoredReconciliation({ role: "platform_finance", result, reason: "Month end" }).persist,
    ).toBe(true);
    expect(() =>
      planStoredReconciliation({ role: "platform_support", result, reason: "Month end" }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102410000_provider_reconciliation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("A missing provider list is not stored");
    expect(sql).not.toContain("stripe.com");
  });
});
