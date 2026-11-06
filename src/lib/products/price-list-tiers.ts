/** Rule thresholds use four decimals; draft quantities up to eight. No float comparisons. */
export type DraftTierPriceRule = {
  id: string;
  product_id: string;
  min_quantity: string;
  effective_from: string;
  effective_to: string | null;
  unit_price_minor: number;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RULE_QUANTITY = /^(\d{1,14})(?:\.(\d{1,4}))?$/;
const DOCUMENT_QUANTITY = /^(\d{1,14})(?:\.(\d{1,8}))?$/;
const FACTOR = 100000000n;

export function validRuleDate(raw: string): boolean {
  const match = DATE.exec(raw);
  if (!match) return false;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const test = new Date(Date.UTC(y, m - 1, d));
  return test.getUTCFullYear() === y &&
    test.getUTCMonth() + 1 === m && test.getUTCDate() === d;
}

function quantityScaled(raw: string, fromDocument = false): bigint | null {
  const match = (fromDocument ? DOCUMENT_QUANTITY : RULE_QUANTITY).exec(raw);
  if (!match) return null;
  return BigInt(match[1]!) * FACTOR +
    BigInt((match[2] ?? "").padEnd(8, "0") || "0");
}

export function validateRuleInput(input: {
  minQuantity: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  unitPriceMinor: number;
}) {
  const scaled = quantityScaled(input.minQuantity);
  if (scaled === null || scaled <= 0n) {
    throw new Error("Minimum quantity must be positive with up to four decimal places");
  }
  if (!validRuleDate(input.effectiveFrom)) {
    throw new Error("Enter a valid effective-from date (1900–9999)");
  }
  if (input.effectiveTo && (!validRuleDate(input.effectiveTo) ||
    input.effectiveTo < input.effectiveFrom)) {
    throw new Error("Effective-to must be a valid date on or after effective-from");
  }
  if (!Number.isSafeInteger(input.unitPriceMinor) || input.unitPriceMinor < 0) {
    throw new Error("Unit price must be a non-negative safe integer in minor units");
  }
  // Normalize equivalent quantities like 01.20 to 1.2 to avoid duplicate keys.
  const integer = scaled / FACTOR;
  const fraction = String(scaled % FACTOR).padStart(8, "0").replace(/0+$/, "");
  return {
    minQuantity: fraction ? `${integer}.${fraction}` : String(integer),
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo || null,
    unitPriceMinor: input.unitPriceMinor,
  };
}

export type DateEffectiveQuantityRule = {
  id: string;
  product_id: string;
  min_quantity: string;
  effective_from: string;
  effective_to: string | null;
};

/**
 * A single rule wins: largest eligible minimum quantity, then latest effective
 * start date, then stable smallest ID. The result never stacks multiple rules.
 */
export function findEffectiveQuantityRule<T extends DateEffectiveQuantityRule>(
  rules: readonly T[],
  productId: string,
  quantity: string,
  date: string,
): T | null {
  if (!validRuleDate(date)) return null;
  const amount = quantityScaled(quantity, true);
  if (amount === null || amount <= 0n) return null;
  let best: T | null = null;
  let bestQty = 0n;
  for (const rule of rules) {
    if (rule.product_id !== productId || rule.effective_from > date ||
      (rule.effective_to !== null && rule.effective_to < date)) continue;
    const minimum = quantityScaled(String(rule.min_quantity));
    if (minimum === null || minimum <= 0n) {
      throw new Error("Invalid price-list quantity threshold returned from the server");
    }
    if (amount < minimum) continue;
    if (!best || minimum > bestQty ||
      (minimum === bestQty && rule.effective_from > best.effective_from) ||
      (minimum === bestQty && rule.effective_from === best.effective_from && rule.id < best.id)) {
      best = rule;
      bestQty = minimum;
    }
  }
  return best;
}

/** Returns the effective fixed-price tier and refuses malformed stored money. */
export function findEffectiveTier(
  rules: readonly DraftTierPriceRule[],
  productId: string,
  quantity: string,
  date: string,
): DraftTierPriceRule | null {
  const selected = findEffectiveQuantityRule(rules, productId, quantity, date);
  if (selected && (!Number.isSafeInteger(selected.unit_price_minor) ||
    selected.unit_price_minor < 0)) {
    throw new Error("Invalid price-list tier amount returned from the server");
  }
  return selected;
}

export function resolveTierUnitPrice(
  productId: string,
  quantity: string,
  date: string,
  fixedPrices: Readonly<Record<string, number>>,
  rules: readonly DraftTierPriceRule[],
): number | undefined {
  const tier = findEffectiveTier(rules, productId, quantity, date);
  if (tier) return tier.unit_price_minor;
  return Object.prototype.hasOwnProperty.call(fixedPrices, productId)
    ? fixedPrices[productId]
    : undefined;
}
