import { toMinorUnits } from "@/lib/accounting/money";
import {
  findEffectiveTier,
  validRuleDate,
  type DraftTierPriceRule,
} from "@/lib/products/price-list-tiers";
import {
  findEffectiveDiscountRule,
  resolveDraftDiscountedUnitPrice,
  type DraftDiscountRule,
} from "@/lib/products/price-list-discounts";

export type PriceListLineSnapshot = {
  source: "price_list";
  price_list_id: string;
  product_id: string;
  currency_code: string;
  unit_price_minor: number;
  quantity: string;
  pricing_date: string;
  basis: "tier" | "fixed" | "catalogue";
  discount_bps: number;
};

/** A snapshot records an actual user-applied amount, never a promise to reprice later. */
export function appliedPriceListSnapshot(input: {
  priceListId: string;
  productId: string;
  currency: string;
  quantity: string;
  documentDate: string;
  cataloguePriceMinor: number | undefined;
  fixedPrices: Readonly<Record<string, number>>;
  tiers: readonly DraftTierPriceRule[];
  discounts: readonly DraftDiscountRule[];
}): PriceListLineSnapshot | null {
  if (!input.priceListId || !input.productId || !validRuleDate(input.documentDate)) return null;
  const priced = resolveDraftDiscountedUnitPrice(
    input.productId,
    input.cataloguePriceMinor,
    input.quantity,
    input.documentDate,
    input.fixedPrices,
    input.tiers,
    input.discounts,
  );
  if (priced === undefined) return null;
  const tier = findEffectiveTier(input.tiers, input.productId, input.quantity, input.documentDate);
  const discount = findEffectiveDiscountRule(
    input.discounts,
    input.productId,
    input.quantity,
    input.documentDate,
  );
  const fixed = Object.prototype.hasOwnProperty.call(input.fixedPrices, input.productId);
  return {
    source: "price_list",
    price_list_id: input.priceListId,
    product_id: input.productId,
    currency_code: input.currency,
    unit_price_minor: priced,
    quantity: String(Number(input.quantity)),
    pricing_date: input.documentDate,
    basis: tier ? "tier" : fixed ? "fixed" : "catalogue",
    discount_bps: discount?.discount_bps ?? 0,
  };
}

/** Invalidate an old price-list claim whenever a user directly edits an amount or item. */
export function withManualPricing<T extends { pricingTrace?: PriceListLineSnapshot | null }>(
  line: T,
  patch: Partial<T>,
): T {
  const invalidates = ["unitPrice", "quantity", "productId"].some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
  return { ...line, ...(invalidates ? { pricingTrace: null } : {}), ...patch };
}

/**
 * Fail closed when the amount/quantity at save differs from the recorded application snapshot.
 * The DB RPC repeats line/list/product/currency checks inside the atomic document transaction.
 */
export function verifiedLinePricing(input: {
  trace: PriceListLineSnapshot | null | undefined;
  selectedPriceListId: string | null;
  productId: string;
  quantity: string;
  unitPrice: string;
  currency: string;
}): PriceListLineSnapshot | null {
  const t = input.trace;
  if (!t) return null;
  if (
    !input.selectedPriceListId ||
    t.price_list_id !== input.selectedPriceListId ||
    !input.productId ||
    t.product_id !== input.productId ||
    t.currency_code !== input.currency ||
    t.quantity !== String(Number(input.quantity)) ||
    Number(toMinorUnits(input.unitPrice, input.currency)) !== t.unit_price_minor
  ) {
    // An old snapshot must never be attached to a changed sales line.
    return null;
  }
  return t;
}
