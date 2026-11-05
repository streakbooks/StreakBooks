import { currencyMinorUnits, divideRounded, parseDecimal, type RoundingMode } from "./money";

/** Base currency of the price book (brief: global prices are set in USD). */
export const BASE_CURRENCY = "USD";

export const PRICING_STRATEGIES = ["BASE", "FIXED", "FX_CONVERTED", "CUSTOM"] as const;
export type PricingStrategy = (typeof PRICING_STRATEGIES)[number];

export const ROUNDING_MODES: readonly RoundingMode[] = ["HALF_UP", "HALF_EVEN", "UP", "DOWN"];

const RATE_PATTERN = /^[0-9]{1,12}(\.[0-9]{1,12})?$/;

export function isValidRate(rate: string): boolean {
  return RATE_PATTERN.test(rate) && parseDecimal(rate).numerator > 0n;
}

/**
 * Converts a USD base price with a decimal rate and a markup in basis points, rounding once.
 * Mirrors billing.fx_convert so a preview always matches the published snapshot.
 */
export function convertBasePrice(input: {
  baseMinor: bigint;
  targetCurrency: string;
  rate: string;
  markupBps: number;
  rounding: RoundingMode;
}): bigint {
  if (!isValidRate(input.rate)) throw new Error("Exchange rate must be a positive decimal");
  if (!Number.isInteger(input.markupBps) || input.markupBps < 0 || input.markupBps > 10000) {
    throw new Error("Markup must be between 0 and 10000 basis points");
  }
  const { numerator, scale } = parseDecimal(input.rate);
  const shift = currencyMinorUnits(input.targetCurrency) - currencyMinorUnits(BASE_CURRENCY);
  let top = input.baseMinor * numerator * BigInt(10000 + input.markupBps);
  let bottom = 10n ** BigInt(scale) * 10000n;
  if (shift >= 0) top *= 10n ** BigInt(shift);
  else bottom *= 10n ** BigInt(-shift);
  return divideRounded(top, bottom, input.rounding);
}

export function strategyFitsCurrency(strategy: PricingStrategy, currency: string): boolean {
  if (strategy === "BASE") return currency === BASE_CURRENCY;
  if (strategy === "FX_CONVERTED") return currency !== BASE_CURRENCY;
  return true;
}

export type PublishedPrice = {
  priceId: string;
  interval: "month" | "year";
  currency: string;
  amountMinor: number;
  strategy: PricingStrategy;
  country: string | null;
};

export type PriceListPlan = {
  code: string;
  name: string;
  versionId: string;
  publishedAt: string | null;
  prices: PublishedPrice[];
};

export type PriceList = {
  country: string | null;
  baseCurrency: string;
  /** Present from the payment pipeline migration onwards. */
  billingEnabled?: boolean;
  providers?: Array<"stripe" | "razorpay">;
  plans: PriceListPlan[];
};

export function planPrice(
  list: PriceList | null | undefined,
  planCode: string,
  interval: "month" | "year",
): PublishedPrice | null {
  const plan = list?.plans.find((item) => item.code === planCode);
  return plan?.prices.find((price) => price.interval === interval) ?? null;
}
