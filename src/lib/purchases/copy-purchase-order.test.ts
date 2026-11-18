import { describe, expect, it } from "vitest";
import { mapPurchaseOrderLinesForCopy } from "@/lib/purchases/copy-purchase-order";

describe("mapPurchaseOrderLinesForCopy", () => {
  it("orders by line_no and maps fields for a new draft (no receipt/bill state)", () => {
    const lines = mapPurchaseOrderLinesForCopy([
      {
        description: "B",
        account_id: "a2",
        quantity: 2,
        unit_price_minor: 500,
        net_minor: 1000,
        tax_rate_bps: 1000,
        line_no: 2,
      },
      {
        description: "A",
        account_id: "a1",
        quantity: 1,
        unit_price_minor: 100,
        net_minor: 90,
        tax_rate_bps: 2000,
        line_no: 1,
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.description).toBe("A");
    expect(lines[0]?.discountMinor).toBe(10);
    expect(lines[0]?.taxRateBps).toBe(2000);
    expect(lines[1]?.description).toBe("B");
    expect(lines[1]?.quantity).toBe(2);
    expect(lines[1]?.unitPriceMinor).toBe(500);
  });

  it("rejects lines without an account", () => {
    expect(() =>
      mapPurchaseOrderLinesForCopy([
        {
          description: "x",
          account_id: null,
          quantity: 1,
          unit_price_minor: 1,
          net_minor: 1,
        },
      ]),
    ).toThrow(/account/i);
  });
});
