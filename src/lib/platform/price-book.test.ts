import { describe, expect, it } from "vitest";
import {
  needsSecondApprover,
  publishGuard,
  quoteFeature,
  usageOverage,
  yearlySavingsMinor,
  type FeaturePrice,
} from "./price-book";

const base: FeaturePrice = {
  featureKey: "ai_queries",
  model: "flat",
  amountMinor: 1000,
  currency: "USD",
  interval: "month",
  minQty: 1,
  maxQty: null,
  includedQty: 0,
  tiers: [],
  taxBps: 0,
};

describe("feature price book", () => {
  it("quotes included, flat, per-user, tiered, volume and usage prices in minor units", () => {
    expect(quoteFeature({ ...base, model: "included", amountMinor: 0 }, 4).netMinor).toBe(0);
    expect(quoteFeature(base, 9).netMinor).toBe(1000);
    expect(quoteFeature({ ...base, model: "per_user", minQty: 0 }, 3).netMinor).toBe(3000);
    expect(
      quoteFeature(
        {
          ...base,
          model: "tiered",
          minQty: 0,
          tiers: [
            { upTo: 2, amountMinor: 100 },
            { upTo: null, amountMinor: 50 },
          ],
        },
        4,
      ).netMinor,
    ).toBe(300);
    expect(
      quoteFeature(
        {
          ...base,
          model: "volume",
          minQty: 0,
          tiers: [
            { upTo: 2, amountMinor: 100 },
            { upTo: null, amountMinor: 50 },
          ],
        },
        4,
      ).netMinor,
    ).toBe(200);
    expect(
      quoteFeature({ ...base, model: "usage", includedQty: 100, amountMinor: 2, minQty: 0 }, 150)
        .netMinor,
    ).toBe(100);
  });

  it("adds operator-supplied tax and compares a yearly quote with twelve monthly totals", () => {
    const monthly = quoteFeature({ ...base, taxBps: 1000 }, 1);
    expect(monthly).toMatchObject({ netMinor: 1000, taxMinor: 100, totalMinor: 1100 });
    const yearly = quoteFeature({ ...base, interval: "year", amountMinor: 10000, taxBps: 0 }, 1);
    expect(yearlySavingsMinor(quoteFeature(base, 1), yearly)).toBe(2000);
  });

  it("blocks a price under the margin floor unless a second approver confirms", () => {
    const costs = [{ key: "ai_query", unitCostMinorUsd: 50, typicalQuantity: 10, maxQuantity: 10 }];
    expect(publishGuard(100, costs, false).allowed).toBe(false);
    expect(publishGuard(100, costs, true).allowed).toBe(true);
    expect(publishGuard(10_000, costs, false).allowed).toBe(true);
  });

  it("requires a second approver for a kill switch, a global change, a deep discount or an oversized bulk", () => {
    expect(needsSecondApprover({ source: "kill_switch" })).toBe(true);
    expect(needsSecondApprover({ scope: "global" })).toBe(true);
    expect(needsSecondApprover({ discountBps: 2001 })).toBe(true);
    expect(needsSecondApprover({ count: 101 })).toBe(true);
    expect(
      needsSecondApprover({ source: "grant", scope: "business", discountBps: 1000, count: 1 }),
    ).toBe(false);
  });

  it("prices usage above the included quantity and leaves a missing rate unpriced", () => {
    expect(usageOverage({ usedQty: 150, includedQty: 100, unitAmountMinor: 2 })).toEqual({
      overageQty: 50,
      netMinor: 100,
    });
    expect(usageOverage({ usedQty: 40, includedQty: 100, unitAmountMinor: 2 })).toEqual({
      overageQty: 0,
      netMinor: 0,
    });
    expect(usageOverage({ usedQty: 150, includedQty: 100, unitAmountMinor: null })).toEqual({
      overageQty: 50,
      netMinor: null,
    });
  });
});
