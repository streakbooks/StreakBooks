import { describe, expect, it } from "vitest";
import { budgetToCsvRows } from "./budget-csv";

describe("budget CSV export total integrity", () => {
  const accounts = [{ id: "income", code: "400", name: "Sales" }];

  it("exports an exact annual total from individual monthly amounts", () => {
    const lines = new Map([["income", [1234, -34, 8900]]]);
    const output = budgetToCsvRows(accounts, lines, "USD");
    expect(output).toHaveLength(1);
    expect(output[0]?.at(-1)).toBe("101.00");
    expect(output[0]?.[2]).toBe("12.34");
  });

  it("rejects individually safe values whose annual total is outside safe precision", () => {
    const lines = new Map([["income", [Number.MAX_SAFE_INTEGER, 1]]]);
    expect(() => budgetToCsvRows(accounts, lines, "USD"))
      .toThrow(/safe minor-unit/);
  });

  it("rejects invalid fractional or unsafe amounts before exporting any values", () => {
    for (const invalid of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        budgetToCsvRows(accounts, new Map([["income", [invalid]]]), "USD"),
      ).toThrow(/safe integer/);
    }
  });

  it("does not mutate the source row amounts while calculating a CSV total", () => {
    const values = [10, 20, 30];
    budgetToCsvRows(accounts, new Map([["income", values]]), "USD");
    expect(values).toEqual([10, 20, 30]);
  });
});
