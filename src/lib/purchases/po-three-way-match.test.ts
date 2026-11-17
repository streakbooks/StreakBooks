import { describe, expect, it } from "vitest";
import {
  assertThreeWayMatchForAuthorise,
  evaluateThreeWayMatch,
  notApplicableMatch,
} from "./po-three-way-match";

const order = {
  lineNo: 1,
  description: "Widgets",
  accountId: "11111111-1111-4111-8111-111111111111",
  quantity: 10,
  quantityReceived: 10,
  netMinor: 10000,
};

const bill = {
  lineNo: 1,
  description: "Widgets",
  accountId: "11111111-1111-4111-8111-111111111111",
  quantity: 10,
  netMinor: 10000,
};

describe("evaluateThreeWayMatch", () => {
  it("passes when order, receipt and bill agree", () => {
    const result = evaluateThreeWayMatch({
      orderLines: [order],
      billLines: [bill],
      receiptQuantitiesAvailable: true,
    });
    expect(result.status).toBe("pass");
    expect(result.applicable).toBe(true);
    expect(result.lines[0]?.status).toBe("pass");
  });

  it("fails when billed quantity exceeds received", () => {
    const result = evaluateThreeWayMatch({
      orderLines: [{ ...order, quantityReceived: 4 }],
      billLines: [bill],
      receiptQuantitiesAvailable: true,
    });
    expect(result.status).toBe("fail");
    expect(result.issues.join(" ")).toMatch(/exceeds received/);
  });

  it("fails when billed net disagrees on a full-quantity line", () => {
    const result = evaluateThreeWayMatch({
      orderLines: [order],
      billLines: [{ ...bill, netMinor: 9999 }],
      receiptQuantitiesAvailable: true,
    });
    expect(result.status).toBe("fail");
  });

  it("allows proportional partial billing at the ordered rate", () => {
    const result = evaluateThreeWayMatch({
      orderLines: [order],
      billLines: [{ ...bill, quantity: 5, netMinor: 5000 }],
      receiptQuantitiesAvailable: true,
    });
    expect(result.status).toBe("pass");
  });

  it("is incomplete when receipt quantities are unavailable", () => {
    const result = evaluateThreeWayMatch({
      orderLines: [{ ...order, quantityReceived: null }],
      billLines: [bill],
      receiptQuantitiesAvailable: false,
    });
    expect(result.status).toBe("incomplete");
  });

  it("marks unmatched bill lines as fail", () => {
    const result = evaluateThreeWayMatch({
      orderLines: [order],
      billLines: [
        {
          ...bill,
          lineNo: 9,
          description: "Other",
          accountId: "22222222-2222-4222-8222-222222222222",
        },
      ],
      receiptQuantitiesAvailable: true,
    });
    expect(result.status).toBe("fail");
    expect(result.issues.join(" ")).toMatch(/no matching/);
  });
});

describe("assertThreeWayMatchForAuthorise", () => {
  it("does not throw when matching is not required", () => {
    expect(() =>
      assertThreeWayMatchForAuthorise(
        evaluateThreeWayMatch({
          orderLines: [{ ...order, quantityReceived: 0 }],
          billLines: [bill],
          receiptQuantitiesAvailable: true,
        }),
        false,
      ),
    ).not.toThrow();
  });

  it("throws when required and match fails", () => {
    expect(() =>
      assertThreeWayMatchForAuthorise(
        evaluateThreeWayMatch({
          orderLines: [{ ...order, quantityReceived: 0 }],
          billLines: [bill],
          receiptQuantitiesAvailable: true,
        }),
        true,
      ),
    ).toThrow(/Three-way matching|exceeds received/);
  });

  it("ignores bills with no purchase order", () => {
    expect(() => assertThreeWayMatchForAuthorise(notApplicableMatch(), true)).not.toThrow();
  });
});
