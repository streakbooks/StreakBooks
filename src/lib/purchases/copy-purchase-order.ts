/**
 * Map a stored purchase order into a new draft payload (copy order).
 * Dates, numbers, status, received/billed quantities and bill links are never copied —
 * only supplier, memo, currency and ordered lines.
 */

import { impliedDiscountMinor } from "@/lib/purchases/po-convert";
import type { PurchaseOrderLineInput } from "@/lib/purchases/purchase-order";

export type StoredPurchaseOrderLineForCopy = {
  description: string;
  account_id: string | null;
  quantity: number;
  unit_price_minor: number;
  net_minor: number;
  tax_rate_bps?: number | null;
  line_no?: number | null;
};

export function mapPurchaseOrderLinesForCopy(
  lines: StoredPurchaseOrderLineForCopy[],
): PurchaseOrderLineInput[] {
  const ordered = [...lines].sort((a, b) => Number(a.line_no ?? 0) - Number(b.line_no ?? 0));
  return ordered.map((l, i) => {
    if (!l.account_id) {
      throw new Error(`Cannot copy order line ${i + 1} without an expense/asset account`);
    }
    const description = (l.description ?? "").trim();
    if (!description) {
      throw new Error(`Cannot copy order line ${i + 1} without a description`);
    }
    return {
      description,
      accountId: l.account_id,
      quantity: Number(l.quantity),
      unitPriceMinor: Number(l.unit_price_minor),
      discountMinor: impliedDiscountMinor({
        quantity: Number(l.quantity),
        unit_price_minor: Number(l.unit_price_minor),
        net_minor: Number(l.net_minor),
      }),
      taxRateBps: Number(l.tax_rate_bps ?? 0),
    };
  });
}
