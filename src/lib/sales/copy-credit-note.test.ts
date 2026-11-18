import { describe, expect, it } from "vitest";
import { mapSalesCreditLinesForCopy } from "@/lib/sales/copy-credit-note";

describe("mapSalesCreditLinesForCopy", () => {
  it("orders by line_order and maps fields for a new draft", () => {
    const lines = mapSalesCreditLinesForCopy([
      {
        description: "B",
        account_id: "a2",
        quantity: 2,
        unit_price_minor: 500,
        line_order: 2,
        tax_code_id: "t1",
      },
      {
        description: "A",
        account_id: "a1",
        quantity: 1,
        unit_price_minor: 100,
        discount_minor: 10,
        tax_rate_bps: 2000,
        line_order: 1,
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.description).toBe("A");
    expect(lines[0]?.discountMinor).toBe(10);
    expect(lines[0]?.taxRateBps).toBe(2000);
    expect(lines[1]?.taxCodeId).toBe("t1");
  });

  it("rejects lines without an account", () => {
    expect(() =>
      mapSalesCreditLinesForCopy([
        {
          description: "x",
          account_id: null,
          quantity: 1,
          unit_price_minor: 1,
        },
      ]),
    ).toThrow(/account/i);
  });
});
