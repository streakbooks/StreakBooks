import { describe, expect, it } from "vitest";
import {
  batchPostedLineIds,
  buildDimensionVariance,
  eligibleDimensionActualLines,
  resolveDimensionActualCutoff,
} from "./budget-dimension-variance";

const inputs = {
  months: ["2026-04-01", "2026-05-01"],
  accounts: [
    { id: "sales", code: "200", name: "Sales", kind: "income" as const },
    { id: "rent", code: "400", name: "Rent", kind: "expense" as const },
  ],
  options: [
    { id: "north", name: "North", code: "N" },
    { id: "south", name: "South", code: "S" },
  ],
  budget: [
    { optionId: "north", accountId: "sales", month: "2026-04-01", amountMinor: 10000 },
    { optionId: "north", accountId: "rent", month: "2026-04-01", amountMinor: 4000 },
  ],
  actual: [
    {
      lineId: "1",
      optionId: "north",
      accountId: "sales",
      month: "2026-04-01",
      debitMinor: 0,
      creditMinor: 12000,
    },
    {
      lineId: "2",
      optionId: "north",
      accountId: "rent",
      month: "2026-04-01",
      debitMinor: 6000,
      creditMinor: 0,
    },
    {
      lineId: "3",
      optionId: null,
      accountId: "sales",
      month: "2026-04-01",
      debitMinor: 0,
      creditMinor: 3000,
    },
  ],
};

describe("dimension budget vs posted journal actuals", () => {
  it("defaults to the latest completed month, not the partial current month", () => {
    expect(resolveDimensionActualCutoff("2026-04-01", "2026-11-06")).toEqual({
      through: "2026-10-31",
      partialMonth: false,
    });
  });
  it("labels a specifically requested partial current month", () => {
    expect(resolveDimensionActualCutoff("2026-04-01", "2026-11-06", "2026-11-06")).toEqual({
      through: "2026-11-06",
      partialMonth: true,
    });
    expect(resolveDimensionActualCutoff("2026-04-01", "2026-11-06", "2026-12-31")).toEqual({
      through: "2026-11-06",
      partialMonth: true,
    });
  });
  it("caps a historical financial year at its correct year-end date", () => {
    expect(resolveDimensionActualCutoff("2025-04-01", "2026-11-06")).toEqual({
      through: "2026-03-31",
      partialMonth: false,
    });
  });
  it("does not invent completed months in a future financial year", () => {
    expect(resolveDimensionActualCutoff("2027-04-01", "2026-11-06")).toEqual({
      through: "2026-10-31",
      partialMonth: false,
    });
  });

  it("queries journal tracking assignments only in bounded posted-line batches", () => {
    const lines = Array.from({ length: 205 }, (_, i) => ({ line_id: `posted-${i}` }));
    const groups = batchPostedLineIds(lines);
    expect(groups.map((group) => group.length)).toEqual([100, 100, 5]);
    expect(groups.flat()).toHaveLength(205);
    expect(batchPostedLineIds([])).toEqual([]);
    expect(batchPostedLineIds([lines[0]!, lines[0]!])).toEqual([["posted-0"]]);
  });

  it("fails closed for a posted line without an ID or invalid batch configuration", () => {
    expect(() => batchPostedLineIds([{ line_id: "" }])).toThrow(/identity/);
    expect(() => batchPostedLineIds([{}])).toThrow(/identity/);
    expect(() => batchPostedLineIds([{ line_id: "valid" }], 101)).toThrow(/batch size/);
  });

  it("excludes closing entries before choosing tracking IDs", () => {
    const lines = [
      { line_id: "operation", source_type: "manual", memo: "Ordinary adjustment" },
      { line_id: "closure", source_type: "other", memo: "Year-end close FY 2026" },
    ];
    expect(batchPostedLineIds(eligibleDimensionActualLines(lines))).toEqual([["operation"]]);
  });

  it("excludes recognized year-end closing postings exactly like the main P&L", () => {
    const lines = [
      { line_id: "ordinary", source_type: "other", memo: "Ordinary adjustment" },
      { line_id: "close", source_type: "other", memo: "Year-end close FY 2026" },
      { line_id: "close-other-type", source_type: "manual", memo: "Year-end close FY 2026" },
      { line_id: "not-close", source_type: "other", memo: "year-end close FY 2026" },
    ];
    expect(eligibleDimensionActualLines(lines).map((line) => line.line_id)).toEqual([
      "ordinary",
      "close-other-type",
      "not-close",
    ]);
    expect(lines).toHaveLength(4);
  });

  it("does not include excluded closing values in option profit/expense variances", () => {
    const posted = eligibleDimensionActualLines([
      {
        ...inputs.actual[0]!,
        source_type: "other",
        memo: "Year-end close FY 2026",
        creditMinor: 50000,
      },
      { ...inputs.actual[1]!, source_type: "manual", memo: "Normal rent" },
    ]);
    const result = buildDimensionVariance({ ...inputs, actual: posted });
    expect(result.summaries.find((s) => s.optionId === "north")?.income.ytd.actualMinor).toBe(0);
    expect(result.summaries.find((s) => s.optionId === "north")?.expense.ytd.actualMinor).toBe(
      6000,
    );
  });

  it("computes income and expense variances with their natural accounting signs", () => {
    const result = buildDimensionVariance(inputs);
    const north = result.summaries.find((o) => o.optionId === "north")!;
    expect(north.income.ytd.varianceMinor).toBe(2000);
    expect(north.expense.ytd.varianceMinor).toBe(-2000);
    expect(north.net.ytd).toMatchObject({
      budgetMinor: 6000,
      actualMinor: 6000,
      varianceMinor: 0,
      status: "on_budget",
    });
  });
  it("discloses unassigned posted lines separately from assigned options", () => {
    const result = buildDimensionVariance(inputs);
    expect(result.assignedLines).toBe(2);
    expect(result.unassignedLines).toBe(1);
    expect(result.summaries.find((o) => o.optionId === null)?.income.ytd.actualMinor).toBe(3000);
    expect(result.summaries.find((o) => o.optionId === "north")?.income.ytd.actualMinor).toBe(
      12000,
    );
  });
  it("shows actual-only options and accounts with zero budget", () => {
    const result = buildDimensionVariance({
      ...inputs,
      actual: [
        ...inputs.actual,
        {
          lineId: "4",
          optionId: "south",
          accountId: "rent",
          month: "2026-05-01",
          debitMinor: 1000,
          creditMinor: 0,
        },
      ],
    });
    expect(result.summaries.find((o) => o.optionId === "south")?.expense.ytd).toMatchObject({
      budgetMinor: 0,
      actualMinor: 1000,
      variancePctBps: null,
    });
  });
  it("excludes months not in the elapsed comparison range", () => {
    const report = buildDimensionVariance({
      ...inputs,
      months: ["2026-04-01"],
    });
    expect(report.months).toHaveLength(1);
    expect(report.assignedLines).toBe(2);
  });
  it("handles returns as negative natural revenue", () => {
    const result = buildDimensionVariance({
      ...inputs,
      budget: [],
      actual: [
        {
          lineId: "ref",
          optionId: "north",
          accountId: "sales",
          month: "2026-04-01",
          debitMinor: 150,
          creditMinor: 0,
        },
      ],
    });
    expect(result.summaries[0]?.income.ytd.actualMinor).toBe(-150);
  });
  it("rejects duplicate posted line identities rather than double-counting", () => {
    expect(() =>
      buildDimensionVariance({
        ...inputs,
        actual: [...inputs.actual, inputs.actual[0]!],
      }),
    ).toThrow(/twice/);
  });
  it("rejects unsafe posted amounts and unsafe percentage overflow", () => {
    expect(() =>
      buildDimensionVariance({
        ...inputs,
        actual: [
          {
            ...inputs.actual[0]!,
            creditMinor: Number.MAX_SAFE_INTEGER + 1,
          },
        ],
      }),
    ).toThrow(/safe integer/);
    expect(() =>
      buildDimensionVariance({
        ...inputs,
        budget: [{ optionId: "north", accountId: "sales", month: "2026-04-01", amountMinor: 1 }],
        actual: [{ ...inputs.actual[0]!, creditMinor: 10 ** 12 }],
      }),
    ).toThrow(/safe minor-unit range/);
  });
  it("does not mutate either budget or posted source data", () => {
    const before = JSON.stringify(inputs);
    buildDimensionVariance(inputs);
    expect(JSON.stringify(inputs)).toBe(before);
  });
});
