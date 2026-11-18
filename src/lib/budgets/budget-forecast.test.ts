import { describe, expect, it } from "vitest";
import { filterProfitLossActivity } from "./budget-report";
import {
  buildBudgetForecast,
  FORECAST_PRESETS,
  validateForecastAssumptions,
} from "./budget-forecast";

const months = Array.from(
  { length: 12 },
  (_, i) => "2026-" + String(i + 1).padStart(2, "0") + "-01",
);
const accounts = [
  { id: "sales", code: "400", name: "Revenue", kind: "income" as const },
  { id: "cost", code: "500", name: "Rent", kind: "expense" as const },
];
const budget = months.flatMap((month) => [
  { accountId: "sales", month, amountMinor: 10000 },
  { accountId: "cost", month, amountMinor: 5000 },
]);
const actuals = [
  { accountId: "sales", month: months[0]!, debitMinor: 0, creditMinor: 11000 },
  { accountId: "sales", month: months[1]!, debitMinor: 0, creditMinor: 9000 },
  { accountId: "sales", month: months[2]!, debitMinor: 0, creditMinor: 10000 },
  { accountId: "cost", month: months[0]!, debitMinor: 7000, creditMinor: 0 },
  { accountId: "cost", month: months[1]!, debitMinor: 6000, creditMinor: 0 },
  { accountId: "cost", month: months[2]!, debitMinor: 5000, creditMinor: 0 },
];
const input = {
  months,
  accounts,
  budget,
  actuals,
  completedIndex: 2,
  assumptions: FORECAST_PRESETS.base,
};

describe("LinkBooks forecast", () => {
  it("accepts historical P&L actuals while excluding balance-sheet ledger activity", () => {
    const historical = [
      ...accounts,
      { id: "old-expense", code: "599", name: "Archived expense", kind: "expense" as const },
    ];
    const posted = [
      ...actuals,
      { accountId: "bank", month: months[0]!, debitMinor: 12000, creditMinor: 0 },
      { accountId: "old-expense", month: months[0]!, debitMinor: 2500, creditMinor: 0 },
    ];
    const relevant = filterProfitLossActivity(historical, posted);
    expect(relevant.some((row) => row.accountId === "bank")).toBe(false);
    const result = buildBudgetForecast({
      ...input,
      accounts: historical,
      actuals: relevant,
    });
    expect(
      result.accounts.find((row) => row.accountId === "old-expense")?.months[0]?.forecastMinor,
    ).toBe(2500);
    expect(result.totals.expense.projectedMinor).toBe(65500);
  });

  it("uses recorded natural actuals then unadjusted budget for remaining months", () => {
    const result = buildBudgetForecast(input);
    expect(result.completedMonths).toBe(3);
    expect(result.projectedMonths).toBe(9);
    expect(result.totals.income).toMatchObject({ budgetMinor: 120000, projectedMinor: 120000 });
    expect(result.totals.expense).toMatchObject({ budgetMinor: 60000, projectedMinor: 63000 });
    expect(result.totals.net).toMatchObject({
      budgetMinor: 60000,
      projectedMinor: 57000,
      varianceMinor: -3000,
    });
    const sales = result.accounts.find((a) => a.accountId === "sales")!;
    expect(sales.months[0]?.source).toBe("actual");
    expect(sales.months[3]?.source).toBe("adjusted_budget");
  });
  it("applies optimistic/conservative growth only to future months", () => {
    const result = buildBudgetForecast({ ...input, assumptions: FORECAST_PRESETS.optimistic });
    expect(result.accounts.find((a) => a.accountId === "sales")?.months[0]?.forecastMinor).toBe(
      11000,
    );
    expect(result.accounts.find((a) => a.accountId === "sales")?.months[3]?.forecastMinor).toBe(
      11000,
    );
    expect(result.accounts.find((a) => a.accountId === "cost")?.months[3]?.forecastMinor).toBe(
      4750,
    );
  });
  it("uses trailing three completed months in run-rate mode including zero-posting months", () => {
    const result = buildBudgetForecast({
      ...input,
      assumptions: { method: "run_rate", incomeBps: 0, expenseBps: 0 },
    });
    expect(result.accounts.find((a) => a.accountId === "sales")?.months[4]?.forecastMinor).toBe(
      10000,
    );
    expect(result.accounts.find((a) => a.accountId === "cost")?.months[4]?.forecastMinor).toBe(
      6000,
    );
  });
  it("falls back to budget when there are no completed months", () => {
    const result = buildBudgetForecast({
      ...input,
      completedIndex: -1,
      assumptions: { method: "run_rate", incomeBps: 0, expenseBps: 0 },
    });
    expect(result.noHistoryCells).toBe(24);
    expect(result.completedThrough).toBeNull();
    expect(result.accounts.find((a) => a.accountId === "sales")?.months[0]?.source).toBe(
      "no_actual_history",
    );
    expect(result.totals.net.projectedMinor).toBe(60000);
  });
  it("supports completed financial years with no forecast months", () => {
    const result = buildBudgetForecast({ ...input, completedIndex: 11 });
    expect(result.projectedMonths).toBe(0);
    expect(result.totals.income.projectedMinor).toBe(30000);
    expect(result.totals.expense.projectedMinor).toBe(18000);
  });
  it("uses debit notes / credit notes with the correct natural signs", () => {
    const result = buildBudgetForecast({
      ...input,
      completedIndex: 0,
      actuals: [
        { accountId: "sales", month: months[0]!, debitMinor: 3000, creditMinor: 1000 },
        { accountId: "cost", month: months[0]!, debitMinor: 2000, creditMinor: 3500 },
      ],
    });
    expect(result.accounts.find((a) => a.accountId === "sales")?.months[0]?.forecastMinor).toBe(
      -2000,
    );
    expect(result.accounts.find((a) => a.accountId === "cost")?.months[0]?.forecastMinor).toBe(
      -1500,
    );
  });
  it("ignores posted partial/future month activity beyond the cutoff", () => {
    const result = buildBudgetForecast({
      ...input,
      completedIndex: 0,
      actuals: [
        ...actuals,
        { accountId: "sales", month: months[4]!, creditMinor: 999999, debitMinor: 0 },
      ],
    });
    expect(result.accounts.find((a) => a.accountId === "sales")?.months[4]?.forecastMinor).toBe(
      10000,
    );
  });
  it("rejects duplicated budget entries and unknown account references", () => {
    expect(() => buildBudgetForecast({ ...input, budget: [...budget, budget[0]!] })).toThrow(
      /Duplicate/,
    );
    expect(() =>
      buildBudgetForecast({
        ...input,
        actuals: [{ accountId: "missing", month: months[0]!, creditMinor: 1, debitMinor: 0 }],
      }),
    ).toThrow(/unknown account/);
  });
  it("rejects invalid percentages, unsafe amounts and invalid cutoffs", () => {
    expect(() =>
      validateForecastAssumptions({ method: "budget", incomeBps: -10001, expenseBps: 0 }),
    ).toThrow();
    expect(() =>
      validateForecastAssumptions({ method: "foo", incomeBps: 0, expenseBps: 0 }),
    ).toThrow();
    expect(() => buildBudgetForecast({ ...input, completedIndex: 12 })).toThrow(/Completed month/);
    expect(() =>
      buildBudgetForecast({
        ...input,
        budget: [{ accountId: "sales", month: months[0]!, amountMinor: Number.MAX_SAFE_INTEGER }],
      }),
    ).toThrow(/safe integer/);
  });
  it("never mutates budget, actuals or accounts", () => {
    const before = JSON.stringify(input);
    buildBudgetForecast(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
