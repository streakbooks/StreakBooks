import { describe, expect, it } from "vitest";
import {
  formatPurchaseQuantity,
  isPurchaseOrderLate,
  purchaseOrderCopyInput,
} from "./po-presentation";

it("preserves all supported receipt quantity decimals", () => {
  expect(formatPurchaseQuantity(0.000001, "en-GB")).toBe("0.000001");
  expect(formatPurchaseQuantity(1234.567891, "en-GB")).toBe("1,234.567891");
});
import type { PurchaseOrderDetail } from "./purchase-order-data";

describe("purchase order presentation", () => {
  it("flags only open overdue deliveries with remaining quantities", () => {
    const state = {
      status: "partially_received",
      expectedDeliveryDate: "2026-11-15",
      outstandingQuantity: 2,
      today: "2026-11-18",
    };
    expect(isPurchaseOrderLate(state)).toBe(true);
    expect(isPurchaseOrderLate({ ...state, outstandingQuantity: 0 })).toBe(false);
    expect(isPurchaseOrderLate({ ...state, status: "cancelled" })).toBe(false);
    expect(isPurchaseOrderLate({ ...state, expectedDeliveryDate: state.today })).toBe(false);
    expect(isPurchaseOrderLate({ ...state, expectedDeliveryDate: null })).toBe(false);
  });

  it("duplicates original ordered quantities with discounts, excluding approval and receipt state", () => {
    const source = {
      id: "source",
      contact_id: "supplier",
      currency_code: "EUR",
      memo: "Handle carefully",
      approval_state: "approved",
      quantity_received: 2,
      purchase_order_lines: [
        {
          id: "line",
          line_no: 1,
          description: "Goods",
          account_id: "account",
          quantity: 3,
          quantity_received: 2,
          quantity_billed: 1,
          unit_price_minor: 100,
          net_minor: 290,
          tax_rate_bps: 2000,
        },
      ],
    } as unknown as PurchaseOrderDetail;
    const copy = purchaseOrderCopyInput(source, "2026-11-18", "request");
    expect(copy.lines[0]).toEqual({
      description: "Goods",
      accountId: "account",
      quantity: 3,
      unitPriceMinor: 100,
      discountMinor: 10,
      taxRateBps: 2000,
    });
    expect(copy).not.toHaveProperty("orderId");
    expect(copy).not.toHaveProperty("approval_state");
    expect(copy.lines[0]).not.toHaveProperty("quantity_received");
    expect(copy.requestId).toBe("request");
  });
});
