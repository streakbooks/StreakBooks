import { describe, expect, it } from "vitest";
import { createSpendMoneyLines, sumSpendMoneyLinesMinor } from "@/lib/banking/spend-money-lines";

describe("spend money line roll-up", () => {
  it("starts with two empty spreadsheet rows", () => {
    expect(createSpendMoneyLines()).toHaveLength(2);
  });

  it("sums qty × unit price into net minor units", () => {
    const result = sumSpendMoneyLinesMinor(
      [
        { id: "1", description: "Fuel", quantity: "2", unitPrice: "10.00" },
        { id: "2", description: "Parking", quantity: "1", unitPrice: "5.50" },
      ],
      "GBP",
    );
    expect(result.netMinor).toBe(2550);
    expect(result.memoFromLines).toBe("Fuel; Parking");
  });

  it("rejects invalid money cells", () => {
    expect(
      sumSpendMoneyLinesMinor(
        [{ id: "1", description: "Bad", quantity: "1", unitPrice: "abc" }],
        "GBP",
      ).netMinor,
    ).toBeNull();
  });
});
