import { documentFigures } from "./report-document";
import { roundDiv } from "@/lib/budgets/budget-math";
import { addMonthsIso, monthEnd } from "@/lib/accounting/fiscal-year";
import { forecastSchema, type ForecastConfig } from "./ecosystem-model";
export const KPI_DEFINITIONS = {
  revenue: "Posted income, net of contra-revenue, over the selected period.",
  gross_profit: "Net revenue less cost of sales over the selected period.",
  net_profit: "Posted income less posted expenses; excludes year-end closing journals.",
  cash: "Closing balance of company bank GL accounts as at the selected end date.",
  working_capital: "Current assets less current liabilities at the selected end date.",
  current_ratio:
    "Current assets divided by current liabilities. Unavailable when liabilities are not positive.",
  gross_margin: "Gross profit divided by net revenue. Unavailable when revenue is not positive.",
  net_margin: "Net profit divided by net revenue. Unavailable when revenue is not positive.",
} as const;
export function managementMetrics(raw: unknown) {
  const { f, current, bs } = documentFigures(raw);
  const currentAssets = bs.sections.find((s) => s.id === "current_assets")?.total_minor ?? 0n;
  const currentLiabilities =
    bs.sections.find((s) => s.id === "current_liabilities")?.total_minor ?? 0n;
  const revenue = current.revenue + current.contraRevenue;
  const ratio = (a: bigint, b: bigint) => (b > 0n ? roundDiv(a * 10000n, b).toString() : null);
  return {
    company: f.company,
    accountingBasis: f.basis ?? "accrual",
    from: f.from,
    to: f.to,
    capturedAt: f.capturedAt,
    hasActivity: f.period.some((b) => b.line_count > 0),
    metrics: {
      revenue: { value: revenue.toString(), format: "money", reportId: "profit-and-loss" },
      gross_profit: {
        value: current.grossProfit.toString(),
        format: "money",
        reportId: "profit-and-loss",
      },
      net_profit: { value: current.net.toString(), format: "money", reportId: "profit-and-loss" },
      cash: {
        value: f.cash.reduce((s, c) => s + BigInt(c.closing_minor), 0n).toString(),
        format: "money",
        reportId: "cash-summary",
      },
      working_capital: {
        value: (currentAssets - currentLiabilities).toString(),
        format: "money",
        reportId: "balance-sheet",
      },
      current_ratio: {
        value: ratio(currentAssets, currentLiabilities),
        format: "ratio",
        reportId: "balance-sheet",
      },
      gross_margin: {
        value: ratio(current.grossProfit, revenue),
        format: "percent",
        reportId: "profit-and-loss",
      },
      net_margin: {
        value: ratio(current.net, revenue),
        format: "percent",
        reportId: "profit-and-loss",
      },
    },
  };
}
/** Forecasts are explicit projections from a full-month historical run rate, never ledger postings. */
export function forecastProjection(
  config: ForecastConfig,
  baseline: { revenueMinor: string; expenseMinor: string },
  actuals: Array<{ month: string; revenueMinor: string; expenseMinor: string }>,
) {
  const cfg = forecastSchema.parse(config);
  if (cfg.baselineFrom.slice(8) !== "01" || monthEnd(cfg.baselineTo) !== cfg.baselineTo)
    throw new Error("Forecast baseline must contain complete calendar months");
  const months =
    (Number(cfg.baselineTo.slice(0, 4)) - Number(cfg.baselineFrom.slice(0, 4))) * 12 +
    Number(cfg.baselineTo.slice(5, 7)) -
    Number(cfg.baselineFrom.slice(5, 7)) +
    1;
  const revenue = roundDiv(BigInt(baseline.revenueMinor), BigInt(months)),
    expense = roundDiv(BigInt(baseline.expenseMinor), BigInt(months));
  const byMonth = new Map(actuals.map((a) => [a.month, a]));
  return cfg.scenarios.map((s) => {
    let rev = revenue,
      cost = expense;
    return {
      scenario: s,
      rows: Array.from({ length: cfg.months }, (_, i) => {
        rev = roundDiv(rev * BigInt(10000 + s.revenueGrowthBps), 10000n);
        cost = roundDiv(cost * BigInt(10000 + s.expenseGrowthBps), 10000n);
        const month = addMonthsIso(cfg.start, i),
          actual = byMonth.get(month);
        const variance = actual ? BigInt(actual.revenueMinor) - rev : null;
        const actualProfit = actual
          ? BigInt(actual.revenueMinor) - BigInt(actual.expenseMinor)
          : null;
        const expenseVariance = actual ? BigInt(actual.expenseMinor) - cost : null;
        const profitVariance = actualProfit === null ? null : actualProfit - (rev - cost);
        const varianceBps = (value: bigint | null, projected: bigint) =>
          value !== null && projected !== 0n
            ? roundDiv(value * 10000n, projected < 0n ? -projected : projected).toString()
            : null;
        return {
          month,
          projectedRevenueMinor: rev.toString(),
          projectedExpenseMinor: cost.toString(),
          projectedProfitMinor: (rev - cost).toString(),
          actualRevenueMinor: actual?.revenueMinor ?? null,
          actualExpenseMinor: actual?.expenseMinor ?? null,
          revenueVarianceMinor: variance?.toString() ?? null,
          revenueVarianceBps: varianceBps(variance, rev),
          actualProfitMinor: actualProfit?.toString() ?? null,
          expenseVarianceMinor: expenseVariance?.toString() ?? null,
          expenseVarianceBps: varianceBps(expenseVariance, cost),
          profitVarianceMinor: profitVariance?.toString() ?? null,
          profitVarianceBps: varianceBps(profitVariance, rev - cost),
        };
      }),
    };
  });
}
