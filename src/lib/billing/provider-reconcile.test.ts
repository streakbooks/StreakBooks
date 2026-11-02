import { describe, expect, it } from "vitest";
import { reconcileProviderCharges } from "./provider-reconcile";

describe("provider reconciliation", () => {
  it("does not treat a missing provider list as zero", () => {
    expect(
      reconcileProviderCharges({
        local: [{ id: "local-1", providerId: "ch_1", currency: "INR", amountMinor: 3000 }],
        provider: null,
      }),
    ).toEqual({
      providerCalled: false,
      state: "unrecorded",
      unmatchedLocal: [],
      extraProvider: [],
      differenceMinor: null,
    });
  });

  it("matches equal charges and keeps a currency change unseparated", () => {
    expect(
      reconcileProviderCharges({
        local: [{ id: "local-1", providerId: "ch_1", currency: "INR", amountMinor: 3000 }],
        provider: [{ id: "ch_1", currency: "INR", amountMinor: 3000 }],
      }).state,
    ).toBe("match");
    const mixed = reconcileProviderCharges({
      local: [{ id: "local-1", providerId: "ch_1", currency: "INR", amountMinor: 3000 }],
      provider: [{ id: "ch_1", currency: "USD", amountMinor: 3000 }],
    });
    expect(mixed.state).toBe("mismatch");
    expect(mixed.differenceMinor).toBeNull();
    expect(mixed.extraProvider).toEqual([]);
    const extra = reconcileProviderCharges({
      local: [],
      provider: [{ id: "ch_2", currency: "INR", amountMinor: 100 }],
    });
    expect(extra.state).toBe("mismatch");
    expect(extra.extraProvider).toEqual(["ch_2"]);
    expect(extra.differenceMinor).toBeNull();
  });
});
