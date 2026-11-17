import { describe, expect, it } from "vitest";
import {
  applyPurchaseOrderReceipt,
  assertCanReceiveAgainstOrder,
  receiveAllOutstanding,
  remainingToReceive,
} from "./po-receipt";

const line = (over: Partial<{ lineId: string; orderedQuantity: number; quantityReceived: number }> = {}) => ({
  lineId: "11111111-1111-4111-8111-111111111111",
  orderedQuantity: 10,
  quantityReceived: 0,
  ...over,
});

describe("purchase order goods receipt", () => {
  it("computes remaining quantity", () => {
    expect(remainingToReceive(line())).toBe(10);
    expect(remainingToReceive(line({ quantityReceived: 4 }))).toBe(6);
    expect(remainingToReceive(line({ quantityReceived: 10 }))).toBe(0);
  });

  it("allows receive on sent and partially_received only", () => {
    expect(() => assertCanReceiveAgainstOrder("sent", null)).not.toThrow();
    expect(() => assertCanReceiveAgainstOrder("partially_received", null)).not.toThrow();
    expect(() => assertCanReceiveAgainstOrder("draft", null)).toThrow(/sent or partially/);
    expect(() => assertCanReceiveAgainstOrder("billed", "bill")).toThrow(/fully billed/);
  });

  it("applies deltas without exceeding outstanding and sets partially_received", () => {
    const result = applyPurchaseOrderReceipt({
      status: "sent",
      billedBillId: null,
      lines: [line(), line({ lineId: "22222222-2222-4222-8222-222222222222", orderedQuantity: 5 })],
      deltas: [
        { lineId: "11111111-1111-4111-8111-111111111111", receiveQuantity: 4 },
        { lineId: "22222222-2222-4222-8222-222222222222", receiveQuantity: 5 },
      ],
    });
    expect(result.nextStatus).toBe("partially_received");
    expect(result.nextLines.find((l) => l.lineId.startsWith("1111"))?.quantityReceived).toBe(4);
    expect(result.nextLines.find((l) => l.lineId.startsWith("2222"))?.quantityReceived).toBe(5);
  });

  it("rejects over-receipt and duplicate lines", () => {
    expect(() =>
      applyPurchaseOrderReceipt({
        status: "sent",
        billedBillId: null,
        lines: [line()],
        deltas: [{ lineId: line().lineId, receiveQuantity: 11 }],
      }),
    ).toThrow(/outstanding/);
    expect(() =>
      applyPurchaseOrderReceipt({
        status: "sent",
        billedBillId: null,
        lines: [line()],
        deltas: [
          { lineId: line().lineId, receiveQuantity: 1 },
          { lineId: line().lineId, receiveQuantity: 1 },
        ],
      }),
    ).toThrow(/once/);
  });

  it("builds receive-all deltas from outstanding quantities", () => {
    expect(
      receiveAllOutstanding([
        line({ quantityReceived: 3 }),
        line({ lineId: "22222222-2222-4222-8222-222222222222", orderedQuantity: 2, quantityReceived: 2 }),
      ]),
    ).toEqual([{ lineId: line().lineId, receiveQuantity: 7 }]);
  });
});
