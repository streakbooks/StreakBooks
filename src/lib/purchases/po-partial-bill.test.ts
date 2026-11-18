import { describe, expect, it } from "vitest";
import {
  assertCanBuildReceivedBill,
  billableQuantity,
  buildReceivedBillLines,
  nextStatusAfterReceivedBill,
  allocateReceivedLine,
} from "./po-partial-bill";

const base = {
  lineId: "11111111-1111-4111-8111-111111111111",
  lineNo: 1,
  description: "Widgets",
  accountId: "22222222-2222-4222-8222-222222222222",
  orderedQuantity: 10,
  quantityReceived: 4,
  quantityBilled: 0,
  unitPriceMinor: 1000,
  netMinor: 10000,
  taxRateBps: 0,
};

describe("billableQuantity", () => {
  it("bills only unbilled received quantity", () => {
    expect(billableQuantity(base)).toBe(4);
    expect(billableQuantity({ ...base, quantityBilled: 1 })).toBe(3);
    expect(billableQuantity({ ...base, quantityReceived: 10, quantityBilled: 10 })).toBe(0);
    expect(billableQuantity({ ...base, quantityReceived: 12 })).toBe(10);
  });
});

describe("cumulative partial-bill allocation", () => {
  it("allocates the final discounted net and tax exactly across split receipts", () => {
    let billedNetMinor = 0,
      billedTaxMinor = 0;
    const allocations = [0, 1, 2].map((billedQuantity) => {
      const result = allocateReceivedLine({
        orderedQuantity: 3,
        billedQuantity,
        billQuantity: 1,
        netMinor: 299,
        taxMinor: 60,
        billedNetMinor,
        billedTaxMinor,
        unitPriceMinor: 100,
        taxRateBps: 2000,
      });
      billedNetMinor += result.netMinor;
      billedTaxMinor += result.taxMinor;
      return result;
    });
    expect(allocations.map((line) => line.netMinor)).toEqual([99, 100, 100]);
    expect(billedNetMinor).toBe(299);
    expect(billedTaxMinor).toBe(60);
  });

  it("uses actual surviving allocations after a draft is deleted or voided", () => {
    expect(
      allocateReceivedLine({
        orderedQuantity: 3,
        billedQuantity: 2,
        billQuantity: 1,
        netMinor: 299,
        taxMinor: 60,
        billedNetMinor: 200,
        billedTaxMinor: 40,
        unitPriceMinor: 100,
        taxRateBps: 2000,
      }),
    ).toMatchObject({ netMinor: 99, taxMinor: 20, discountMinor: 1 });
  });

  it("records fractional-quantity residuals separately from discounts", () => {
    expect(
      allocateReceivedLine({
        orderedQuantity: 1,
        billedQuantity: 0.333333,
        billQuantity: 0.333334,
        netMinor: 3,
        taxMinor: 0,
        billedNetMinor: 0,
        billedTaxMinor: 0,
        unitPriceMinor: 3,
        taxRateBps: 0,
      }),
    ).toMatchObject({ netMinor: 2, discountMinor: 0, roundingMinor: 1 });
  });

  it("fails closed on inconsistent prior amount or over-billing", () => {
    expect(() =>
      allocateReceivedLine({
        orderedQuantity: 3,
        billedQuantity: 1,
        billQuantity: 1,
        netMinor: 299,
        taxMinor: 60,
        billedNetMinor: 250,
        billedTaxMinor: 20,
        unitPriceMinor: 100,
        taxRateBps: 2000,
      }),
    ).toThrow(/reconcile/);
    expect(() =>
      allocateReceivedLine({
        orderedQuantity: 3,
        billedQuantity: 2,
        billQuantity: 2,
        netMinor: 299,
        taxMinor: 60,
        unitPriceMinor: 100,
        taxRateBps: 2000,
      }),
    ).toThrow(/quantity/);
  });
});

describe("buildReceivedBillLines", () => {
  it("builds a partial bill at the ordered rate", () => {
    const result = buildReceivedBillLines([base]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.quantity).toBe(4);
    expect(result.lines[0]?.netMinor).toBe(4000);
    expect(result.fullyBilledAfter).toBe(false);
    expect(nextStatusAfterReceivedBill(result.fullyBilledAfter)).toBe("partially_received");
  });

  it("marks fully billed when received and billed cover the order", () => {
    const result = buildReceivedBillLines([{ ...base, quantityReceived: 10 }]);
    expect(result.fullyBilledAfter).toBe(true);
    expect(nextStatusAfterReceivedBill(true)).toBe("billed");
  });

  it("rejects convert when nothing is receivable/billable", () => {
    expect(() =>
      assertCanBuildReceivedBill({
        status: "sent",
        lines: [{ ...base, quantityReceived: 0 }],
      }),
    ).toThrow(/Nothing to bill/);
    expect(() =>
      assertCanBuildReceivedBill({
        status: "draft",
        lines: [base],
      }),
    ).toThrow(/sent or partially/);
  });
});
