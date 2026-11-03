import { addMonthsIso, monthEnd } from "@/lib/accounting/fiscal-year";
import { fromMinorUnits } from "@/lib/accounting/money";
import { decimalValue } from "./custom-definition";
import type { ForecastConfig } from "./ecosystem-model";
import type { ReportDocument } from "./report-document";
import type { captureForecast } from "./forecast-calculation.server";

/** Exported projections are explicitly separate from posted financial statements. */
export function forecastReportDocument(
  result: Awaited<ReturnType<typeof captureForecast>>,
  config: ForecastConfig,
  title: string,
): ReportDocument {
  const currency = result.company.baseCurrency;
  const amount = (value: string | null) =>
    value === null ? "Unavailable" : fromMinorUnits(BigInt(value), currency);
  const percent = (value: string | null) =>
    value === null ? "Unavailable" : decimalValue({ n: value, d: "100" }, 2);
  return {
    title,
    company: result.company.name,
    currency,
    from: config.start,
    to: monthEnd(addMonthsIso(config.start, config.months - 1)),
    capturedAt: result.capturedAt,
    subtitle:
      "Operating forecast versus completed-month actuals · projections are not ledger balances",
    header: "",
    footer: "LinkBooks · Operating forecast",
    orientation: "landscape",
    notes: `Baseline: ${config.baselineFrom} to ${config.baselineTo}. Projections use a complete-month historical average and compound scenario growth. These are operating projections, not cash forecasts. Actuals include completed months only. Variance is actual minus projected; percentage denominators use the absolute projection. Lower expense variance is favourable. Missing actuals and zero-denominator percentages are Unavailable.`,
    sections: result.projections.map((output) => ({
      id: output.scenario.id,
      title: output.scenario.name,
      labelHeader: "Month",
      columns: [
        "Projected revenue",
        "Projected expenses",
        "Projected profit",
        "Actual revenue",
        "Actual expenses",
        "Actual profit",
        "Revenue variance",
        "Revenue variance %",
        "Expense variance",
        "Expense variance %",
        "Profit variance",
        "Profit variance %",
      ],
      columnFormats: [
        "money",
        "money",
        "money",
        "money",
        "money",
        "money",
        "money",
        "percent",
        "money",
        "percent",
        "money",
        "percent",
      ],
      note: `${output.scenario.assumptions} Monthly revenue growth: ${output.scenario.revenueGrowthBps} basis points. Monthly expense growth: ${output.scenario.expenseGrowthBps} basis points.`,
      rows: output.rows.map((row) => ({
        label: row.month,
        kind: "account",
        format: "money",
        negative: "parentheses",
        thousands: true,
        values: [
          amount(row.projectedRevenueMinor),
          amount(row.projectedExpenseMinor),
          amount(row.projectedProfitMinor),
          amount(row.actualRevenueMinor),
          amount(row.actualExpenseMinor),
          amount(row.actualProfitMinor),
          amount(row.revenueVarianceMinor),
          percent(row.revenueVarianceBps),
          amount(row.expenseVarianceMinor),
          percent(row.expenseVarianceBps),
          amount(row.profitVarianceMinor),
          percent(row.profitVarianceBps),
        ],
      })),
    })),
  };
}
