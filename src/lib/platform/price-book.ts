import type { BillingCurrency, BillingInterval } from "@/lib/billing/pricing";
import { planMargin, type CostInput } from "@/lib/billing/margin";

export const PRICE_MODELS = [
  "included",
  "flat",
  "per_user",
  "per_unit",
  "tiered",
  "volume",
  "usage",
] as const;
export type PriceModel = (typeof PRICE_MODELS)[number];

export type PriceTier = { upTo: number | null; amountMinor: number };

export type FeaturePrice = {
  featureKey: string;
  model: PriceModel;
  /** Integer minor units. For usage, this is the overage unit price. */
  amountMinor: number;
  currency: BillingCurrency;
  interval: BillingInterval;
  minQty: number;
  maxQty: number | null;
  includedQty: number;
  tiers: readonly PriceTier[];
  /** Operator-supplied basis points. Zero until a reviewed jurisdiction rate is stored. */
  taxBps: number;
};

export type FeatureQuote = {
  currency: BillingCurrency;
  interval: BillingInterval;
  quantity: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  model: PriceModel;
};

function assertMoney(amount: number, label: string) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative integer of minor units.`);
  }
}

function clampQuantity(price: FeaturePrice, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative integer.");
  }
  const min = Math.max(0, price.minQty);
  if (quantity < min) return min;
  if (price.maxQty != null && quantity > price.maxQty) return price.maxQty;
  return quantity;
}

function tierAmount(
  tiers: readonly PriceTier[],
  quantity: number,
  mode: "tiered" | "volume",
): number {
  if (tiers.length === 0) throw new Error("Tiered and volume prices need at least one tier.");
  const ordered = tiers.slice().sort((a, b) => {
    if (a.upTo == null) return 1;
    if (b.upTo == null) return -1;
    return a.upTo - b.upTo;
  });
  if (mode === "volume") {
    const tier = ordered.find((row) => row.upTo == null || quantity <= row.upTo) ?? ordered.at(-1)!;
    assertMoney(tier.amountMinor, "Tier amount");
    return quantity * tier.amountMinor;
  }
  let remaining = quantity;
  let previous = 0;
  let total = 0;
  for (const tier of ordered) {
    assertMoney(tier.amountMinor, "Tier amount");
    const cap = tier.upTo ?? previous + remaining;
    const width = Math.max(0, Math.min(remaining, cap - previous));
    total += width * tier.amountMinor;
    remaining -= width;
    previous = cap;
    if (remaining === 0) break;
  }
  return total;
}

export function quoteFeature(price: FeaturePrice, requestedQty: number): FeatureQuote {
  assertMoney(price.amountMinor, "Price");
  if (!Number.isInteger(price.taxBps) || price.taxBps < 0 || price.taxBps > 10_000) {
    throw new Error("Tax rate must be a whole number of basis points from 0 to 10000.");
  }
  const quantity =
    price.model === "included" || price.model === "flat" ? 1 : clampQuantity(price, requestedQty);
  let netMinor = 0;
  if (price.model === "flat") netMinor = price.amountMinor;
  if (price.model === "per_user" || price.model === "per_unit")
    netMinor = price.amountMinor * quantity;
  if (price.model === "tiered" || price.model === "volume") {
    netMinor = tierAmount(price.tiers, quantity, price.model);
  }
  if (price.model === "usage") {
    const overage = Math.max(0, quantity - Math.max(0, price.includedQty));
    netMinor = overage * price.amountMinor;
  }
  const taxMinor = Math.floor((netMinor * price.taxBps) / 10_000);
  return {
    currency: price.currency,
    interval: price.interval,
    quantity,
    netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
    model: price.model,
  };
}

/** Yearly savings against twelve monthly charges. Both quotes must share a currency. */
export function yearlySavingsMinor(monthly: FeatureQuote, yearly: FeatureQuote): number {
  if (monthly.currency !== yearly.currency) throw new Error("Compare prices in one currency.");
  if (monthly.interval !== "month" || yearly.interval !== "year") {
    throw new Error("Savings compare a monthly quote with a yearly quote.");
  }
  return monthly.totalMinor * 12 - yearly.totalMinor;
}

export function publishGuard(
  priceMinorUsd: number,
  costs: readonly CostInput[],
  secondApprover: boolean,
): { allowed: boolean; typicalMarginBps: number; maxMarginBps: number } {
  const margin = planMargin(priceMinorUsd, costs);
  const below = margin.belowTypicalFloor || margin.belowMaxFloor;
  return {
    allowed: !below || secondApprover,
    typicalMarginBps: margin.typicalMarginBps,
    maxMarginBps: margin.maxMarginBps,
  };
}

export const BULK_LIMIT = 100;
export const MAX_SELF_SERVE_DISCOUNT_BPS = 2000;

export function needsSecondApprover(input: {
  source?: string;
  scope?: string;
  discountBps?: number;
  count?: number;
}): boolean {
  if (input.source === "kill_switch" || input.scope === "global") return true;
  if ((input.discountBps ?? 0) > MAX_SELF_SERVE_DISCOUNT_BPS) return true;
  if ((input.count ?? 0) > BULK_LIMIT) return true;
  return false;
}
