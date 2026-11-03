import { describe, expect, it } from "vitest";
import {
  assertOrderDate,
  assertOrderStatusChange,
  emptyOrderLine,
  orderLinesFromForm,
  validatePurchaseOrderLines,
} from "./purchase-order";
import { sumLines } from "./line-math";
import { impliedDiscountMinor } from "./po-convert";
import { mapPurchaseOrder } from "@/lib/documents/mappers";
import { documentAppPath } from "@/lib/documents/types";
const accountId = "11111111-1111-4111-8111-111111111111";
const line = {
  description: "Equipment",
  accountId,
  quantity: 2,
  unitPriceMinor: 5000,
  discountMinor: 1000,
  taxRateBps: 2000,
};

describe("purchase order amounts", () => {
  it("preserves fractional quantities, discounts and tax through the stored PO-to-bill shape", () => {
    const computed = validatePurchaseOrderLines([
      line,
      { ...line, quantity: 1.5, unitPriceMinor: 1001, discountMinor: 2, taxRateBps: 750 },
    ]);
    expect(sumLines(computed)).toEqual({
      subtotal_minor: 10499n,
      tax_minor: 1912n,
      total_minor: 12411n,
    });
    for (const l of computed)
      expect(
        impliedDiscountMinor({
          quantity: l.quantity,
          unit_price_minor: l.unitPriceMinor,
          net_minor: Number(l.net_minor),
        }),
      ).toBe(l.discountMinor);
  });
  it.each([
    ["GBP", "12.34", 1234],
    ["JPY", "1234", 1234],
    ["KWD", "1.234", 1234],
  ])("parses %s prices using currency precision", (currency, price, expected) => {
    const result = orderLinesFromForm(
      [{ ...emptyOrderLine(), description: "Item", accountId, unitPrice: price }],
      currency,
    );
    expect(result[0]?.unitPriceMinor).toBe(expected);
  });
  it("accepts two decimal tax percentages without floating point rejection", () => {
    expect(
      orderLinesFromForm(
        [{ ...emptyOrderLine(), description: "Item", accountId, taxPercent: "8.13" }],
        "GBP",
      )[0]?.taxRateBps,
    ).toBe(813);
  });
  it.each([
    { quantity: 0 },
    { quantity: -1 },
    { quantity: Infinity },
    { quantity: 1.0000001 },
    { unitPriceMinor: 0.5 },
    { unitPriceMinor: -1 },
    { unitPriceMinor: Number.MAX_SAFE_INTEGER, quantity: 2 },
    { discountMinor: 10001 },
    { taxRateBps: 10001 },
    { taxRateBps: 0.5 },
    { taxRateBps: NaN },
    { description: " " },
    { accountId: "bad" },
  ])("rejects invalid line %o before persistence", (patch) => {
    expect(() => validatePurchaseOrderLines([{ ...line, ...patch }])).toThrow();
  });
  it("bounds order size and exact summed totals", () => {
    expect(() => validatePurchaseOrderLines([])).toThrow();
    expect(() => validatePurchaseOrderLines(Array.from({ length: 201 }, () => line))).toThrow();
    expect(() =>
      validatePurchaseOrderLines(
        Array.from({ length: 2 }, () => ({
          ...line,
          quantity: 1,
          unitPriceMinor: Number.MAX_SAFE_INTEGER,
          discountMinor: 0,
          taxRateBps: 0,
        })),
      ),
    ).toThrow("total");
  });
  it("keeps discount information on printable purchase orders", () => {
    const doc = mapPurchaseOrder(
      {
        order_date: "2026-11-03",
        currency_code: "GBP",
        subtotal_minor: 9000,
        tax_minor: 1800,
        total_minor: 10800,
      },
      [{ quantity: 2, unit_price_minor: 5000, net_minor: 9000, tax_minor: 1800 }],
      null,
      { baseCurrency: "GBP", companyTaxNumber: null },
    );
    expect(doc.lines[0]?.discountMinor).toBe(1000);
    expect(doc.lines[0]?.grossMinor).toBe(10800);
    expect(documentAppPath("purchase_order", accountId)).toBe(`/purchases/orders/${accountId}`);
  });
});
describe("order dates and lifecycle", () => {
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "", "invalid"])(
    "rejects impossible date %s",
    (date) => expect(() => assertOrderDate(date)).toThrow(),
  );
  it("accepts leap days", () => expect(assertOrderDate("2028-02-29")).toBe("2028-02-29"));
  it("allows manual delivery and cancellation only for unbilled eligible orders", () => {
    expect(() => assertOrderStatusChange("draft", null, "sent")).not.toThrow();
    expect(() => assertOrderStatusChange("sent", null, "cancelled")).not.toThrow();
    expect(() => assertOrderStatusChange("draft", null, "cancelled")).not.toThrow();
    for (const status of ["billed", "cancelled", "partially_received", "unknown"])
      expect(() => assertOrderStatusChange(status, null, "cancelled")).toThrow();
    expect(() => assertOrderStatusChange("sent", null, "sent")).toThrow();
    expect(() => assertOrderStatusChange("draft", "bill-id", "sent")).toThrow();
  });
});
