import { describe, expect, it } from "vitest";
import { buildBudgetScenarioComparison, type ScenarioAccount } from "./budget-scenarios";

const accounts: ScenarioAccount[] = [
  { id: "sales", code: "200", name: "Sales", kind: "income" },
  { id: "rent", code: "400", name: "Rent", kind: "expense" },
  { id: "former", code: "410", name: "Archived expense", kind: "expense" },
];
const sample = {
  accounts,
  baselineStart: "2025-04-01",
  scenarioStart: "2026-04-01",
  baselineLines: [
    { accountId: "sales", month: "2025-04-01", amountMinor: 100_000 },
    { accountId: "rent", month: "2025-04-01", amountMinor: 50_000 },
    { accountId: "former", month: "2025-05-01", amountMinor: 5_000 },
  ],
  scenarioLines: [
    { accountId: "sales", month: "2026-04-01", amountMinor: 120_000 },
    { accountId: "rent", month: "2026-04-01", amountMinor: 40_000 },
  ],
};
describe("budget scenario comparison", () => {
  it("aligns the first fiscal month across different financial years", () => {
    const r = buildBudgetScenarioComparison(sample);
    expect(r.income.rows[0]!.months[0]).toMatchObject({
      baselineMinor: 100_000,
      scenarioMinor: 120_000,
      varianceMinor: 20_000,
      status: "favourable",
    });
    expect(r.income.rows[0]!.months[1]!.scenarioMinor).toBe(0);
  });
  it("treats expense reductions as favourable and keeps archived account amounts", () => {
    const r = buildBudgetScenarioComparison(sample);
    expect(r.expense.rows.map((row) => row.code)).toEqual(["400", "410"]);
    expect(r.expense.rows[0]!.annual.varianceMinor).toBe(10_000);
    expect(r.expense.rows[1]!.annual.varianceMinor).toBe(5_000);
    expect(r.net.annual).toMatchObject({
      baselineMinor: 45_000,
      scenarioMinor: 80_000,
      varianceMinor: 35_000,
      status: "favourable",
    });
    expect(r.accountCount).toBe(3);
  });
  it("does not mutate source inputs", () => {
    const before = JSON.stringify(sample);
    buildBudgetScenarioComparison(sample);
    expect(JSON.stringify(sample)).toBe(before);
  });
  it("does not invent percentages for a zero baseline", () => {
    const r = buildBudgetScenarioComparison({ ...sample, baselineLines: [] });
    expect(r.income.annual.variancePctBps).toBeNull();
    expect(r.expense.annual.status).toBe("unfavourable");
  });
  it("rejects unknown accounts, non-fiscal months and duplicate keys", () => {
    expect(() =>
      buildBudgetScenarioComparison({
        ...sample,
        scenarioLines: [{ accountId: "other", month: "2026-04-01", amountMinor: 1 }],
      }),
    ).toThrow(/unavailable/);
    expect(() =>
      buildBudgetScenarioComparison({
        ...sample,
        scenarioLines: [{ accountId: "sales", month: "2025-04-01", amountMinor: 1 }],
      }),
    ).toThrow(/outside/);
    expect(() =>
      buildBudgetScenarioComparison({
        ...sample,
        scenarioLines: [sample.scenarioLines[0]!, sample.scenarioLines[0]!],
      }),
    ).toThrow(/Duplicate/);
  });
  it("rejects overflow in individual amounts or annual totals", () => {
    expect(() =>
      buildBudgetScenarioComparison({
        ...sample,
        scenarioLines: [{ accountId: "sales", month: "2026-04-01", amountMinor: 1e16 }],
      }),
    ).toThrow(/safe minor-unit/);
    expect(() =>
      buildBudgetScenarioComparison({
        ...sample,
        scenarioLines: [
          { accountId: "sales", month: "2026-04-01", amountMinor: Number.MAX_SAFE_INTEGER },
          { accountId: "sales", month: "2026-05-01", amountMinor: 1 },
        ],
      }),
    ).toThrow(/safe minor-unit/);
  });
});
