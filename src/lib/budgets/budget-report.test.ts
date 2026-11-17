import { describe, expect, it } from "vitest";
import {
  buildBudgetVsActual,
  filterProfitLossActivity,
  parseSafeBudgetMinor,
  type BudgetReportAccount,
} from "./budget-report";
import type { BudgetColumn } from "./budget-math";

const accounts: BudgetReportAccount[] = [
  { id: "sales", code: "200", name: "Sales", kind: "income" },
  { id: "rent", code: "400", name: "Rent", kind: "expense" },
];
const columns: BudgetColumn[] = [
  { key: "apr", label: "April", months: ["2026-04-01"] },
  { key: "may", label: "May", months: ["2026-05-01"] },
  { key: "ytd", label: "YTD", months: ["2026-04-01", "2026-05-01"] },
];
const sample = {
  accounts,
  columns,
  budget: [
    { accountId: "sales", month: "2026-04-01", amountMinor: 10_000 },
    { accountId: "rent", month: "2026-04-01", amountMinor: 4_000 },
    { accountId: "sales", month: "2026-05-01", amountMinor: 8_000 },
    { accountId: "rent", month: "2026-05-01", amountMinor: 3_000 },
  ],
  actuals: [
    { accountId: "sales", month: "2026-04-01", debitMinor: 500, creditMinor: 12_500 },
    { accountId: "rent", month: "2026-04-01", debitMinor: 6_000, creditMinor: 0 },
    { accountId: "sales", month: "2026-05-01", debitMinor: 0, creditMinor: 9_000 },
    { accountId: "rent", month: "2026-05-01", debitMinor: 2_500, creditMinor: 0 },
  ],
};

describe("Budget vs Actual accounting integrity", () => {
  it("preserves exact posted BIGINT values without first rounding in JavaScript", () => {
    expect(parseSafeBudgetMinor("9007199254740991", "Budget")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseSafeBudgetMinor("-9007199254740991", "Budget")).toBe(Number.MIN_SAFE_INTEGER);
    expect(parseSafeBudgetMinor(9007199254740991n, "Budget")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseSafeBudgetMinor("0", "Actual")).toBe(0);
  });

  it("rejects unsafe SQL BIGINT strings instead of rounding cents", () => {
    expect(() => parseSafeBudgetMinor("9007199254740992", "Budget")).toThrow(/safe minor-unit/);
    expect(() => parseSafeBudgetMinor("-9007199254740992", "Actual")).toThrow(/safe minor-unit/);
    expect(() => parseSafeBudgetMinor(Number.MAX_SAFE_INTEGER + 1, "Actual")).toThrow(
      /safe integer/,
    );
  });

  it("rejects missing, decimal, empty and malformed stored financial amounts", () => {
    for (const invalid of [null, undefined, "", "1.2", " 12", "12x", 12.1]) {
      expect(() => parseSafeBudgetMinor(invalid, "Amount")).toThrow();
    }
  });

  it("excludes balance-sheet journal activity while retaining historical P&L accounts", () => {
    const historical: BudgetReportAccount[] = [
      ...accounts,
      { id: "archived", code: "401", name: "Archived expense", kind: "expense" },
    ];
    const ledger = [
      { accountId: "bank", month: "2026-04-01", debitMinor: 5000, creditMinor: 0 },
      { accountId: "sales", month: "2026-04-01", debitMinor: 0, creditMinor: 1000 },
      { accountId: "archived", month: "2026-04-01", debitMinor: 300, creditMinor: 0 },
    ];
    const filtered = filterProfitLossActivity(historical, ledger);
    expect(filtered.map((row) => row.accountId)).toEqual(["sales", "archived"]);
    const report = buildBudgetVsActual({
      accounts: historical,
      budget: [],
      actuals: filtered,
      columns,
    });
    expect(report.income.totals[0]?.actualMinor).toBe(1000);
    expect(report.expense.totals[0]?.actualMinor).toBe(300);
    expect(report.expense.rows.find((row) => row.accountId === "archived")).toBeDefined();
    expect(ledger).toHaveLength(3);
  });

  it("reconciles monthly and YTD income, expense and profit using natural account signs", () => {
    const report = buildBudgetVsActual(sample);
    expect(report.income.totals[0]).toMatchObject({
      budgetMinor: 10_000,
      actualMinor: 12_000,
      varianceMinor: 2_000,
    });
    expect(report.expense.totals[0]).toMatchObject({
      budgetMinor: 4_000,
      actualMinor: 6_000,
      varianceMinor: -2_000,
    });
    expect(report.net[0]).toMatchObject({
      budgetMinor: 6_000,
      actualMinor: 6_000,
      varianceMinor: 0,
    });
    expect(report.net[2]).toMatchObject({
      budgetMinor: 11_000,
      actualMinor: 12_500,
      varianceMinor: 1_500,
    });
  });

  it("preserves split debit/credit activity without rounding normal amounts", () => {
    const report = buildBudgetVsActual({
      ...sample,
      actuals: [
        { accountId: "sales", month: "2026-04-01", debitMinor: 150, creditMinor: 10_000 },
        { accountId: "sales", month: "2026-04-01", debitMinor: 125, creditMinor: 1_000 },
      ],
    });
    expect(report.income.totals[0]?.actualMinor).toBe(10_725);
  });

  it("rejects unsafe integer inputs instead of displaying imprecise currency", () => {
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        budget: [
          { accountId: "sales", month: "2026-04-01", amountMinor: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }),
    ).toThrow(/safe integer/);
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        actuals: [{ accountId: "sales", month: "2026-04-01", debitMinor: 0.25, creditMinor: 10 }],
      }),
    ).toThrow(/safe integer/);
  });

  it("fails closed when individually safe entries overflow an account total", () => {
    const high = 5_000_000_000_000_000;
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        budget: [
          { accountId: "sales", month: "2026-04-01", amountMinor: high },
          { accountId: "sales", month: "2026-04-01", amountMinor: high },
        ],
        actuals: [],
      }),
    ).toThrow(/supported minor-unit range/);
  });

  it("detects overflow at the income/expense section subtotal", () => {
    const high = 5_000_000_000_000_000;
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        accounts: [
          ...accounts,
          {
            id: "other",
            code: "201",
            name: "Other income",
            kind: "income" as const,
          },
        ],
        budget: [
          { accountId: "sales", month: "2026-04-01", amountMinor: high },
          { accountId: "other", month: "2026-04-01", amountMinor: high },
        ],
        actuals: [],
      }),
    ).toThrow(/supported minor-unit range/);
  });

  it("rejects unknown accounts instead of silently omitting posted activity", () => {
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        actuals: [{ accountId: "missing", month: "2026-04-01", debitMinor: 0, creditMinor: 100 }],
      }),
    ).toThrow(/unavailable account/);
  });

  it("rejects duplicate account metadata", () => {
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        accounts: [accounts[0]!, accounts[0]!],
      }),
    ).toThrow(/Duplicate account/);
  });

  it("rejects an unsafe percentage rather than silently rounding it", () => {
    expect(() =>
      buildBudgetVsActual({
        ...sample,
        budget: [{ accountId: "sales", month: "2026-04-01", amountMinor: 1 }],
        actuals: [
          {
            accountId: "sales",
            month: "2026-04-01",
            debitMinor: 0,
            creditMinor: 1_000_000_000_000,
          },
        ],
      }),
    ).toThrow(/supported safe minor-unit range/);
  });

  it("does not mutate input accounts, columns, budget or activity", () => {
    const before = JSON.stringify(sample);
    buildBudgetVsActual(sample);
    expect(JSON.stringify(sample)).toBe(before);
  });
});
