import type { PurchaseOrderDetail } from "./purchase-order-data";
import { impliedDiscountMinor } from "./po-convert";

/** Receiving supports six decimal places; never round a nonzero receipt down to zero in the UI. */
export function formatPurchaseQuantity(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value);
}

/** Late delivery is an operational exception, independent of whether a draft bill exists. */
export function isPurchaseOrderLate(input: {
  status: string;
  expectedDeliveryDate?: string | null;
  outstandingQuantity: number;
  today: string;
}): boolean {
  return (
    ["sent", "partially_received"].includes(input.status) &&
    Boolean(input.expectedDeliveryDate && input.expectedDeliveryDate < input.today) &&
    input.outstandingQuantity > 0
  );
}

/** Copy commercial inputs only. Approval, fulfilment and source identities never carry over. */
export function purchaseOrderCopyInput(
  order: PurchaseOrderDetail,
  today: string,
  requestId: string,
) {
  return {
    contactId: order.contact_id,
    orderDate: today,
    currencyCode: order.currency_code.trim(),
    requestId,
    memo: order.memo ?? "",
    lines: [...order.purchase_order_lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((line) => ({
        description: line.description,
        accountId: line.account_id,
        quantity: Number(line.quantity),
        unitPriceMinor: Number(line.unit_price_minor),
        discountMinor: impliedDiscountMinor(line),
        taxRateBps: Number(line.tax_rate_bps),
      })),
  };
}
