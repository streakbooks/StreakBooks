/** Read-only comparison of 12 fiscal-month budget scenarios in integer minor units. */
import {
  computeVariance,
  fiscalMonthStarts,
  type BudgetAccountKind,
  type VarianceStatus,
} from "@/lib/budgets/budget-math";
import type { MonthAmount } from "@/lib/budgets/budget-report";

export type ScenarioAccount = {
  id: string;
  code: string;
  name: string;
  kind: BudgetAccountKind;
};
export type ScenarioCell = {
  baselineMinor: number;
  scenarioMinor: number;
  varianceMinor: number;
  variancePctBps: number | null;
  status: VarianceStatus;
};
export type ScenarioRow = ScenarioAccount & { months: ScenarioCell[]; annual: ScenarioCell };
export type ScenarioSection = {
  rows: ScenarioRow[];
  months: ScenarioCell[];
  annual: ScenarioCell;
};
export type ScenarioComparison = {
  income: ScenarioSection;
  expense: ScenarioSection;
  net: { months: ScenarioCell[]; annual: ScenarioCell };
  accountCount: number;
};

function safe(amount: number): number {
  if (!Number.isSafeInteger(amount))
    throw new Error("Budget comparison exceeds the safe minor-unit range.");
  return amount;
}
function sum(values: readonly number[]): number {
  return values.reduce((total, value) => safe(total + safe(value)), 0);
}
function cell(kind: BudgetAccountKind, left: number, right: number): ScenarioCell {
  safe(left);
  safe(right);
  safe(right - left);
  const variance = computeVariance(kind, left, right);
  safe(variance.varianceMinor);
  if (variance.variancePctBps !== null) safe(variance.variancePctBps);
  return { baselineMinor: left, scenarioMinor: right, ...variance };
}
function indexLines(
  lines: readonly MonthAmount[],
  fiscalStart: string,
  accounts: ReadonlyMap<string, ScenarioAccount>,
): Map<string, number[]> {
  const positions = new Map(fiscalMonthStarts(fiscalStart).map((month, i) => [month, i]));
  const result = new Map<string, number[]>();
  const used = new Set<string>();
  for (const line of lines) {
    if (!accounts.has(line.accountId))
      throw new Error("Budget line references an unavailable income or expense account.");
    const i = positions.get(line.month);
    if (i === undefined) throw new Error("Budget line is outside its fiscal year.");
    const key = `${line.accountId}:${line.month}`;
    if (used.has(key)) throw new Error("Duplicate account/month in budget.");
    used.add(key);
    const amounts = result.get(line.accountId) ?? Array.from({ length: 12 }, () => 0);
    amounts[i] = safe(line.amountMinor);
    result.set(line.accountId, amounts);
  }
  return result;
}
export function buildBudgetScenarioComparison(input: {
  accounts: readonly ScenarioAccount[];
  baselineStart: string;
  scenarioStart: string;
  baselineLines: readonly MonthAmount[];
  scenarioLines: readonly MonthAmount[];
}): ScenarioComparison {
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  if (accounts.size !== input.accounts.length) throw new Error("Duplicate account identities.");
  const baseline = indexLines(input.baselineLines, input.baselineStart, accounts);
  const scenario = indexLines(input.scenarioLines, input.scenarioStart, accounts);
  const ids = new Set([...baseline.keys(), ...scenario.keys()]);
  const sections: Record<BudgetAccountKind, ScenarioRow[]> = { income: [], expense: [] };
  const sorted = [...ids]
    .map((id) => accounts.get(id)!)
    .sort(
      (a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true }) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  for (const account of sorted) {
    const left = baseline.get(account.id) ?? Array.from({ length: 12 }, () => 0);
    const right = scenario.get(account.id) ?? Array.from({ length: 12 }, () => 0);
    sections[account.kind].push({
      ...account,
      months: left.map((amount, i) => cell(account.kind, amount, right[i] ?? 0)),
      annual: cell(account.kind, sum(left), sum(right)),
    });
  }
  const section = (kind: BudgetAccountKind): ScenarioSection => {
    const rows = sections[kind];
    return {
      rows,
      months: Array.from({ length: 12 }, (_, i) =>
        cell(
          kind,
          sum(rows.map((r) => r.months[i]!.baselineMinor)),
          sum(rows.map((r) => r.months[i]!.scenarioMinor)),
        ),
      ),
      annual: cell(
        kind,
        sum(rows.map((r) => r.annual.baselineMinor)),
        sum(rows.map((r) => r.annual.scenarioMinor)),
      ),
    };
  };
  const income = section("income");
  const expense = section("expense");
  const net = {
    months: income.months.map((c, i) =>
      cell(
        "income",
        safe(c.baselineMinor - expense.months[i]!.baselineMinor),
        safe(c.scenarioMinor - expense.months[i]!.scenarioMinor),
      ),
    ),
    annual: cell(
      "income",
      safe(income.annual.baselineMinor - expense.annual.baselineMinor),
      safe(income.annual.scenarioMinor - expense.annual.scenarioMinor),
    ),
  };
  return { income, expense, net, accountCount: ids.size };
}
