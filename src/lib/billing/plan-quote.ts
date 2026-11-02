import { dependencyIssues, type FeatureDependency } from "@/lib/platform/entitlements";
import { quoteFeature, type FeaturePrice, type PriceModel } from "@/lib/platform/price-book";
import type { BillingCurrency } from "@/lib/billing/pricing";

export type PlanQuoteSelection = { featureKey: string; quantity: number };

export type PlanQuoteLine = {
  featureKey: string;
  quantity: number;
  monthlyNetMinor: number | null;
  monthlyTaxMinor: number | null;
  yearlyNetMinor: number | null;
  yearlyTaxMinor: number | null;
};

export type PlanBuilderQuote = {
  currency: BillingCurrency;
  planCode: string;
  planMonthlyMinor: number | null;
  planYearlyMinor: number | null;
  lines: PlanQuoteLine[];
  monthlyTotalMinor: number | null;
  yearlyTotalMinor: number | null;
  yearlySavingsMinor: number | null;
  issues: { featureKey: string; message: string }[];
};

const MODELS = new Set<PriceModel>([
  "included",
  "flat",
  "per_user",
  "per_unit",
  "tiered",
  "volume",
  "usage",
]);

export function assertFeaturePrice(value: FeaturePrice): FeaturePrice {
  if (!MODELS.has(value.model)) throw new Error(`Unknown price model for ${value.featureKey}.`);
  return value;
}

function onePrice(
  prices: readonly FeaturePrice[],
  featureKey: string,
  currency: BillingCurrency,
  interval: "month" | "year",
): FeaturePrice | null {
  const matches = prices.filter(
    (row) =>
      row.featureKey === featureKey && row.currency === currency && row.interval === interval,
  );
  if (matches.length > 1) {
    throw new Error(`More than one live ${interval} price is published for ${featureKey}.`);
  }
  return matches[0] ?? null;
}

function sum(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value == null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** Recurring quote from published plan amounts and live feature prices. Does not charge. */
export function buildPlanQuote(input: {
  planCode: string;
  currency: BillingCurrency;
  planMonthlyMinor: number | null;
  planYearlyMinor: number | null;
  prices: readonly FeaturePrice[];
  selections: readonly PlanQuoteSelection[];
  dependencies: readonly FeatureDependency[];
}): PlanBuilderQuote {
  const prices = input.prices.map(assertFeaturePrice);
  const lines = input.selections.map((selection) => {
    const monthly = onePrice(prices, selection.featureKey, input.currency, "month");
    const yearly = onePrice(prices, selection.featureKey, input.currency, "year");
    const monthlyQuote = monthly ? quoteFeature(monthly, selection.quantity) : null;
    const yearlyQuote = yearly ? quoteFeature(yearly, selection.quantity) : null;
    return {
      featureKey: selection.featureKey,
      quantity: selection.quantity,
      monthlyNetMinor: monthlyQuote?.netMinor ?? null,
      monthlyTaxMinor: monthlyQuote?.taxMinor ?? null,
      yearlyNetMinor: yearlyQuote?.netMinor ?? null,
      yearlyTaxMinor: yearlyQuote?.taxMinor ?? null,
    };
  });
  const monthlyTotalMinor = sum([
    input.planMonthlyMinor,
    ...lines.map((line) =>
      line.monthlyNetMinor == null || line.monthlyTaxMinor == null
        ? null
        : line.monthlyNetMinor + line.monthlyTaxMinor,
    ),
  ]);
  const yearlyTotalMinor = sum([
    input.planYearlyMinor,
    ...lines.map((line) =>
      line.yearlyNetMinor == null || line.yearlyTaxMinor == null
        ? null
        : line.yearlyNetMinor + line.yearlyTaxMinor,
    ),
  ]);
  return {
    currency: input.currency,
    planCode: input.planCode,
    planMonthlyMinor: input.planMonthlyMinor,
    planYearlyMinor: input.planYearlyMinor,
    lines,
    monthlyTotalMinor,
    yearlyTotalMinor,
    yearlySavingsMinor:
      monthlyTotalMinor == null || yearlyTotalMinor == null
        ? null
        : monthlyTotalMinor * 12 - yearlyTotalMinor,
    issues: dependencyIssues(
      input.selections.map((selection) => selection.featureKey),
      input.dependencies,
    ).map((issue) => ({ featureKey: issue.featureKey, message: issue.message })),
  };
}
