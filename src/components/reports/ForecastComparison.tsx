import { fromMinorUnits } from "@/lib/accounting/money";
import { decimalValue } from "@/lib/reports/custom-definition";
import type { forecastProjection } from "@/lib/reports/management";

type ForecastResult = ReturnType<typeof forecastProjection>[number];

/** Exact operating comparisons; projections remain separate from posted actuals. */
export function ForecastComparison({
  output,
  currency,
}: {
  output: ForecastResult;
  currency: string;
}) {
  const money = (value: string | null) =>
    value === null ? "No completed-month actual" : fromMinorUnits(BigInt(value), currency);
  const percent = (value: string | null) =>
    value === null ? "Unavailable" : `${decimalValue({ n: value, d: "100" }, 2)}%`;
  return (
    <section className="min-w-0 space-y-3" aria-label="Forecast versus actual">
      <div>
        <h3 className="font-semibold">{output.scenario.name} · Forecast versus actual</h3>
        <p className="text-sm text-muted-foreground">{output.scenario.assumptions}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {currency} · Variance is actual minus projected; percentages use the absolute projected
        amount. A lower expense variance is favourable. Actuals include completed months only.
        Percentages with a zero projected denominator are unavailable.
      </p>
      <div
        className="max-w-full overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"
        role="region"
        aria-label="Forecast comparison results"
        tabIndex={0}
      >
        <table className="w-full whitespace-nowrap text-right text-sm tabular-nums">
          <caption className="sr-only">
            Operating forecast and completed-month actuals in {currency}
          </caption>
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left" rowSpan={2} scope="col">
                Month
              </th>
              <th className="p-3 text-center" colSpan={3} scope="colgroup">
                Projected
              </th>
              <th className="border-l p-3 text-center" colSpan={3} scope="colgroup">
                Actual
              </th>
              <th className="border-l p-3 text-center" colSpan={6} scope="colgroup">
                Variance · actual minus projected
              </th>
            </tr>
            <tr>
              {[
                "Revenue",
                "Expenses",
                "Profit",
                "Revenue",
                "Expenses",
                "Profit",
                "Revenue amount",
                "Revenue %",
                "Expense amount",
                "Expense %",
                "Profit amount",
                "Profit %",
              ].map((label, index) => (
                <th key={index} scope="col" className="px-3 pb-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {output.rows.map((row) => (
              <tr key={row.month} className="border-t">
                <th scope="row" className="p-3 text-left font-medium">
                  {row.month}
                </th>
                <td className="p-3">{money(row.projectedRevenueMinor)}</td>
                <td className="p-3">{money(row.projectedExpenseMinor)}</td>
                <td className="p-3">{money(row.projectedProfitMinor)}</td>
                <td className="border-l p-3">{money(row.actualRevenueMinor)}</td>
                <td className="p-3">{money(row.actualExpenseMinor)}</td>
                <td className="p-3">{money(row.actualProfitMinor)}</td>
                <td className="border-l p-3">
                  {row.revenueVarianceMinor === null
                    ? "Unavailable"
                    : money(row.revenueVarianceMinor)}
                </td>
                <td className="p-3">{percent(row.revenueVarianceBps)}</td>
                <td className="p-3">
                  {row.expenseVarianceMinor === null
                    ? "Unavailable"
                    : money(row.expenseVarianceMinor)}
                </td>
                <td className="p-3">{percent(row.expenseVarianceBps)}</td>
                <td className="p-3">
                  {row.profitVarianceMinor === null
                    ? "Unavailable"
                    : money(row.profitVarianceMinor)}
                </td>
                <td className="p-3">{percent(row.profitVarianceBps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
