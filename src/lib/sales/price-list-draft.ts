import { fromMinorUnits } from "@/lib/accounting/money";
import type { SalesLineFormState } from "@/lib/sales/line-form-state";

export type DraftPriceOverride = { product_id: string; unit_price_minor: number };

/** A list only changes explicit item prices. Unlisted products use their normal catalogue price. */
export function selectedUnitPriceMinor(
  productId: string,
  basePriceMinor: number,
  overrides: Readonly<Record<string, number>>,
): number {
  const override = Object.prototype.hasOwnProperty.call(overrides, productId)
    ? overrides[productId]
    : undefined;
  return override ?? basePriceMinor;
}

export function indexDraftPriceOverrides(
  entries: readonly DraftPriceOverride[],
): Record<string, number> {
  const result: Record<string, number> = Object.create(null);
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.unit_price_minor) || entry.unit_price_minor < 0) {
      throw new Error("Invalid price-list amount");
    }
    result[entry.product_id] = entry.unit_price_minor;
  }
  return result;
}

/**
 * Explicitly reprice *only* existing lines with product IDs and price-list overrides.
 * All other fields, including tax, account, discount and quantity, stay unchanged.
 * Never called automatically when a price list is selected or when loading saved documents.
 */
export function previewPriceListApplication(
  lines: readonly SalesLineFormState[],
  overrides: Readonly<Record<string, number>>,
  currency: string,
): { lines: SalesLineFormState[]; changed: number; matched: number } {
  let changed = 0;
  let matched = 0;
  const updated = lines.map((line) => {
    if (!line.productId || !Object.prototype.hasOwnProperty.call(overrides, line.productId)) {
      return { ...line };
    }
    const priceMinor = overrides[line.productId];
    if (priceMinor === undefined || !Number.isSafeInteger(priceMinor) || priceMinor < 0) {
      throw new Error("Invalid price-list amount");
    }
    matched++;
    const nextPrice = fromMinorUnits(BigInt(priceMinor), currency);
    if (line.unitPrice !== nextPrice) changed++;
    return { ...line, unitPrice: nextPrice };
  });
  return { lines: updated, changed, matched };
}
