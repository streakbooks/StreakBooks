import { describe, expect, it } from "vitest";
import { preparePriorYearActualsDraft } from "./budget-prior-year";

const months = (value: number) => Array.from({ length: 12 }, () => value);
const active = ["sales", "rent"];

describe("prior-year budget copy integrity", () => {
  it("copies all twelve months for every editable account", () => {
    const rows = [
      { accountId: "sales", accountCode: "400", accountName: "Sales", months: months(100) },
      { accountId: "rent", accountCode: "500", accountName: "Rent", months: months(-10) },
    ];
    const draft = preparePriorYearActualsDraft(active, rows);
    expect(Object.keys(draft).sort()).toEqual(["rent", "sales"]);
    expect(draft["sales"]).toEqual(months(100));
    expect(draft["rent"]).toEqual(months(-10));
    draft["sales"]![0] = 777;
    expect(rows[0]!.months[0]).toBe(100);
  });

  it("blocks the entire copy if a historical income or expense account is archived", () => {
    const rows = [
      { accountId: "sales", months: months(100) },
      { accountId: "closed", accountCode: "499", accountName: "Closed income", months: months(90) },
    ];
    expect(() => preparePriorYearActualsDraft(active, rows)).toThrow(
      /Copy blocked: 1 historical account\(s\).*499 · Closed income/,
    );
    expect(rows[0]!.months[0]).toBe(100);
  });

  it("reports multiple unavailable accounts without discarding their values", () => {
    expect(() =>
      preparePriorYearActualsDraft(active, [
        { accountId: "old1", accountName: "Old sales", months: months(500) },
        { accountId: "old2", accountName: "Old rent", months: months(50) },
      ]),
    ).toThrow(/2 historical account/);
  });

  it("rejects incomplete or overlong fiscal-year rows", () => {
    expect(() =>
      preparePriorYearActualsDraft(active, [{ accountId: "sales", months: [100, 200] }]),
    ).toThrow(/twelve fiscal months/);
    expect(() =>
      preparePriorYearActualsDraft(active, [{ accountId: "sales", months: [...months(100), 100] }]),
    ).toThrow(/twelve fiscal months/);
  });

  it("rejects unsafe, fractional and out-of-range posted actuals", () => {
    for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, 900_000_000_000_001, NaN]) {
      expect(() =>
        preparePriorYearActualsDraft(active, [{ accountId: "sales", months: months(value) }]),
      ).toThrow(/supported budget cell/);
    }
  });

  it("rejects duplicate or missing account identities", () => {
    expect(() =>
      preparePriorYearActualsDraft(active, [
        { accountId: "sales", months: months(1) },
        { accountId: "sales", months: months(2) },
      ]),
    ).toThrow(/duplicated account/);
    expect(() =>
      preparePriorYearActualsDraft(active, [{ accountId: "", months: months(1) }]),
    ).toThrow(/missing or duplicated account/);
  });

  it("does not accept an ambiguous duplicate ID in the editable chart", () => {
    expect(() =>
      preparePriorYearActualsDraft(["sales", "sales"], [{ accountId: "sales", months: months(1) }]),
    ).toThrow(/duplicate IDs/);
  });

  it("supports a legitimate zero-activity prior financial year", () => {
    expect(Object.keys(preparePriorYearActualsDraft(active, []))).toEqual([]);
  });
});
