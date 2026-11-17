import { describe, expect, it } from "vitest";
import {
  assertCanBuildReceivedBill,
  billableQuantity,
  buildReceivedBillLines,
  nextStatusAfterReceivedBill,
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
