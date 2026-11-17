import {
  findEffectiveQuantityRule,
  resolveTierUnitPrice,
  validateRuleInput,
  type DateEffectiveQuantityRule,
  type DraftTierPriceRule,
} from "@/lib/products/price-list-tiers";

export type DraftDiscountRule = DateEffectiveQuantityRule & {
  discount_bps: number;
};

/** 12.50% = 1,250 basis points; never parse percentages via floating point. */
export function discountPercentToBps(raw: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec((raw ?? "").trim());
  if (!match) throw new Error("Discount must be between 0 and 100%, with at most 2 decimal places");
  const result = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return validateDiscountBps(result);
}

export function discountBpsToPercent(bps: number): string {
  validateDiscountBps(bps);
  return `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, "0")}`;
}

export function validateDiscountBps(bps: number): number {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error("Discount must be between 0 and 100%, with at most 2 decimal places");
  }
  return bps;
}

export function validateDiscountRuleInput(input: {
  minQuantity: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  discountBps: number;
}) {
  const base = validateRuleInput({ ...input, unitPriceMinor: 0 });
  return {
    minQuantity: base.minQuantity,
    effectiveFrom: base.effectiveFrom,
    effectiveTo: base.effectiveTo,
    discountBps: validateDiscountBps(input.discountBps),
  };
}

export function findEffectiveDiscountRule(
  rules: readonly DraftDiscountRule[],
  productId: string,
  quantity: string,
  documentDate: string,
): DraftDiscountRule | null {
  const selected = findEffectiveQuantityRule(rules, productId, quantity, documentDate);
  if (selected) validateDiscountBps(selected.discount_bps);
  return selected;
}

/** Half-up rounding on a positive unit price, using bigint arithmetic. */
export function discountedUnitPriceMinor(basePriceMinor: number, bps: number): number {
  validateDiscountBps(bps);
  if (!Number.isSafeInteger(basePriceMinor) || basePriceMinor < 0) {
    throw new Error("Invalid base price in minor currency units");
  }
  const result = (BigInt(basePriceMinor) * BigInt(10000 - bps) + 5000n) / 10000n;
  return Number(result);
}

/**
 * Precedence:
 * 1. highest eligible fixed-price quantity tier
 * 2. fixed override (if one exists)
 * 3. catalogue base price
 * Then apply ONE highest eligible percentage rule to the chosen unit price.
 *
 * The existing sales line discount amount and tax calculations remain separate,
 * downstream operations. No automatic repricing of saved lines.
 *
 * Returns undefined only if there is no list pricing adjustment at all.
 */
export function resolveDraftDiscountedUnitPrice(
  productId: string,
  cataloguePriceMinor: number | undefined,
  quantity: string,
  documentDate: string,
  fixedPrices: Readonly<Record<string, number>>,
  fixedTiers: readonly DraftTierPriceRule[],
  discountRules: readonly DraftDiscountRule[],
): number | undefined {
  const fixedOrTier = resolveTierUnitPrice(
    productId,
    quantity,
    documentDate,
    fixedPrices,
    fixedTiers,
  );
  const percent = findEffectiveDiscountRule(discountRules, productId, quantity, documentDate);
  if (fixedOrTier === undefined && percent === null) return undefined;
  const base = fixedOrTier ?? cataloguePriceMinor;
  if (base === undefined) {
    throw new Error("Cannot resolve a discounted price without an authorised catalogue base");
  }
  return percent ? discountedUnitPriceMinor(base, percent.discount_bps) : base;
}
