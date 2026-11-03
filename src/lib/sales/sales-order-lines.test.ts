import { describe, expect, it } from "vitest";
import { salesOrderLinesFromForm, validateSalesOrderLineInputs } from "./sales-order-lines";
import { emptyOrderLine } from "@/lib/purchases/purchase-order";
const accountId = "11111111-1111-4111-8111-111111111111";
const line = {
  ...emptyOrderLine(),
  description: "Service",
  accountId,
  quantity: "1.5",
  unitPrice: "10.01",
  taxPercent: "20",
};
describe("sales order arithmetic", () => {
  it("uses sales half-up quantity rounding", () =>
    expect(salesOrderLinesFromForm([line], "GBP", "exclusive")[0]).toEqual(
      expect.objectContaining({ net_minor: 1502n, tax_minor: 300n, gross_minor: 1802n }),
    ));
  it("uses the company inclusive tax treatment", () =>
    expect(salesOrderLinesFromForm([line], "GBP", "inclusive")[0]).toEqual(
      expect.objectContaining({ net_minor: 1252n, tax_minor: 250n, gross_minor: 1502n }),
    ));
  it("accepts fractional tax percentages without floating point drift", () =>
    expect(
      salesOrderLinesFromForm([{ ...line, taxPercent: "8.13" }], "GBP", "exclusive")[0]?.taxRateBps,
    ).toBe(813));
  it.each([
    { quantity: "1.0000001" },
    { taxPercent: "8.123" },
    { discount: "10000" },
    { unitPrice: "-1" },
    { description: "" },
    { accountId: "bad" },
  ])("rejects invalid input %o", (patch) =>
    expect(() => salesOrderLinesFromForm([{ ...line, ...patch }], "GBP", "exclusive")).toThrow(),
  );
  it("allows a discount equal to a sales-rounded fractional extension", () =>
    expect(
      validateSalesOrderLineInputs([
        { description: "x", accountId, quantity: 1.5, unitPriceMinor: 1001, discountMinor: 1502 },
      ])[0]?.discountMinor,
    ).toBe(1502));
});
