/**
 * Map a stored sales credit note into a new draft payload (copy credit).
 * Dates, numbers, allocations and posted journals are never copied — only
 * customer, memo, currency and line pricing fields.
 */

export type StoredSalesCreditLineForCopy = {
  description: string;
  account_id: string | null;
  quantity: number;
  unit_price_minor: number;
  discount_minor?: number | null;
  tax_rate_bps?: number | null;
  tax_code_id?: string | null;
  product_id?: string | null;
  line_order?: number | null;
};

export function mapSalesCreditLinesForCopy(lines: StoredSalesCreditLineForCopy[]) {
  const ordered = [...lines].sort(
    (a, b) => Number(a.line_order ?? 0) - Number(b.line_order ?? 0),
  );
  return ordered.map((l, i) => {
    if (!l.account_id) {
      throw new Error(`Cannot copy credit line ${i + 1} without an income/liability account`);
    }
    const description = (l.description ?? "").trim();
    if (!description) {
      throw new Error(`Cannot copy credit line ${i + 1} without a description`);
    }
    return {
      description,
      accountId: l.account_id,
      quantity: Number(l.quantity),
      unitPriceMinor: Number(l.unit_price_minor),
      discountMinor: Number(l.discount_minor ?? 0),
      taxRateBps: Number(l.tax_rate_bps ?? 0),
      taxCodeId: l.tax_code_id ?? null,
      productId: l.product_id ?? null,
    };
  });
}
