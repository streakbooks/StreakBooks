import { describe, expect, it } from "vitest";
import { FEATURE_DEPENDENCIES } from "@/lib/platform/feature-registry";
import type { FeaturePrice } from "@/lib/platform/price-book";
import { buildPlanQuote } from "./plan-quote";

const aiMonthly: FeaturePrice = {
  featureKey: "ai_queries",
  model: "usage",
  amountMinor: 2,
  currency: "USD",
  interval: "month",
  minQty: 0,
  maxQty: null,
  includedQty: 100,
  tiers: [],
  taxBps: 0,
};

describe("customer plan quote", () => {
  it("adds the published plan to priced add-ons and leaves tax out of the net", () => {
    const quote = buildPlanQuote({
      planCode: "growth",
      currency: "USD",
      planMonthlyMinor: 3000,
      planYearlyMinor: 30000,
      prices: [aiMonthly, { ...aiMonthly, interval: "year", includedQty: 1200, amountMinor: 2 }],
      selections: [{ featureKey: "ai_queries", quantity: 150 }],
      dependencies: FEATURE_DEPENDENCIES,
    });
    expect(quote.lines[0]).toMatchObject({ monthlyNetMinor: 100, monthlyTaxMinor: 0 });
    expect(quote.monthlyTotalMinor).toBe(3100);
    expect(quote.yearlySavingsMinor).toBe(3100 * 12 - quote.yearlyTotalMinor!);
    expect(quote.issues).toEqual([]);
  });

  it("does not invent a total when a selected feature has no live price", () => {
    const quote = buildPlanQuote({
      planCode: "growth",
      currency: "USD",
      planMonthlyMinor: 3000,
      planYearlyMinor: null,
      prices: [],
      selections: [{ featureKey: "voice_minutes", quantity: 1 }],
      dependencies: [],
    });
    expect(quote.monthlyTotalMinor).toBeNull();
    expect(quote.yearlyTotalMinor).toBeNull();
    expect(quote.yearlySavingsMinor).toBeNull();
  });

  it("blocks a feature whose required companion is not selected", () => {
    const quote = buildPlanQuote({
      planCode: "growth",
      currency: "GBP",
      planMonthlyMinor: 2400,
      planYearlyMinor: 24000,
      prices: [
        {
          ...aiMonthly,
          featureKey: "white_label",
          model: "flat",
          currency: "GBP",
          amountMinor: 500,
          includedQty: 0,
        },
        {
          ...aiMonthly,
          featureKey: "white_label",
          model: "flat",
          currency: "GBP",
          interval: "year",
          amountMinor: 5000,
          includedQty: 0,
        },
      ],
      selections: [{ featureKey: "white_label", quantity: 1 }],
      dependencies: FEATURE_DEPENDENCIES,
    });
    expect(quote.issues.map((issue) => issue.message)).toEqual([
      "white_label requires client_portal.",
    ]);
  });
});
