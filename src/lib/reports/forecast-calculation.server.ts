import type { Sb } from "@/lib/accounting/ledger-data";
import { addMonthsIso, monthEnd, todayIso } from "@/lib/accounting/fiscal-year";
import { callRpc } from "@/lib/planning/rpc";
import { documentFigures } from "./report-document";
import { forecastProjection } from "./management";
import { forecastSchema, type ForecastConfig } from "./ecosystem-model";

/** The preview and exports share one posted-ledger capture and exact calculation path. */
export async function captureForecast(supabase: Sb, companyId: string, input: ForecastConfig) {
  const config = forecastSchema.parse(input);
  if (config.baselineFrom.slice(8) !== "01" || monthEnd(config.baselineTo) !== config.baselineTo)
    throw new Error("Forecast baseline must contain complete calendar months");
  async function capture(from: string, to: string) {
    const raw = await callRpc(
      supabase,
      "capture_reporting_facts",
      {
        _company_id: companyId,
        _from: from,
        _to: to,
      },
      "The reporting ecosystem database update is required.",
    );
    const figures = documentFigures(raw);
    if (figures.f.company.id !== companyId || figures.f.from !== from || figures.f.to !== to)
      throw new Error("Forecast ledger capture does not match the requested company or dates");
    return figures;
  }
  const base = await capture(config.baselineFrom, config.baselineTo);
  const today = todayIso();
  const actuals: Array<{ month: string; revenueMinor: string; expenseMinor: string }> = [];
  const completed = Array.from({ length: config.months }, (_, index) =>
    addMonthsIso(config.start, index),
  ).filter((date) => monthEnd(date) < today);
  for (let index = 0; index < completed.length; index += 6) {
    const batch = await Promise.all(
      completed.slice(index, index + 6).map(async (month) => {
        const actual = await capture(month, monthEnd(month));
        if (actual.f.company.baseCurrency !== base.f.company.baseCurrency)
          throw new Error("Forecast captures must use the same company base currency");
        return {
          month,
          revenueMinor: (actual.current.revenue + actual.current.contraRevenue).toString(),
          expenseMinor: actual.current.expense.toString(),
        };
      }),
    );
    actuals.push(...batch);
  }
  return {
    company: base.f.company,
    capturedAt: new Date().toISOString(),
    projections: forecastProjection(
      config,
      {
        revenueMinor: (base.current.revenue + base.current.contraRevenue).toString(),
        expenseMinor: base.current.expense.toString(),
      },
      actuals,
    ),
  };
}
