import { describe, expect, it } from "vitest";
import { managementMetrics, forecastProjection, KPI_DEFINITIONS } from "./management";
import { reportingFactsFixture } from "./__fixtures__/facts";
import { forecastSchema, KPI_IDS } from "./ecosystem-model";
describe("documented management metrics and projected assumptions", () => {
  it("reconciles profitability, bank balances, working capital and undefined ratios independently", () => {
    const { metrics } = managementMetrics(reportingFactsFixture());
    expect(metrics.revenue.value).toBe("15000");
    expect(metrics.net_profit.value).toBe("11000");
    expect(metrics.cash.value).toBe("11000");
    expect(metrics.working_capital.value).toBe("11000");
    expect(metrics.current_ratio.value).toBe(null);
    expect(metrics.net_margin.value).toBe("7333");
    for (const id of KPI_IDS) expect(KPI_DEFINITIONS[id].length).toBeGreaterThan(30);
  });
  it("keeps scenarios separate, compounds documented growth and compares completed actuals", () => {
    const cfg = forecastSchema.parse({
      start: "2026-11-01",
      months: 2,
      baselineFrom: "2026-09-01",
      baselineTo: "2026-10-31",
      scenarios: [
        {
          id: "base",
          name: "Base",
          revenueGrowthBps: 0,
          expenseGrowthBps: 0,
          assumptions: "No growth",
        },
        {
          id: "best",
          name: "Growth",
          revenueGrowthBps: 1000,
          expenseGrowthBps: 0,
          assumptions: "10% monthly revenue growth",
        },
      ],
    });
    const results = forecastProjection(cfg, { revenueMinor: "30000", expenseMinor: "8000" }, [
      { month: "2026-11-01", revenueMinor: "16000", expenseMinor: "4000" },
    ]);
    expect(results[0]!.rows[0]!.projectedRevenueMinor).toBe("15000");
    expect(results[0]!.rows[0]!.revenueVarianceMinor).toBe("1000");
    expect(results[1]!.rows[0]!.projectedRevenueMinor).toBe("16500");
    expect(results[1]!.rows[1]!.projectedRevenueMinor).toBe("18150");
    expect(results[0]!.rows[1]!.actualRevenueMinor).toBe(null);
  });
  it("rejects incomplete baselines, duplicate scenarios and overlapping forecast actual periods", () => {
    const config = {
      start: "2026-11-01",
      months: 12,
      baselineFrom: "2026-10-02",
      baselineTo: "2026-10-31",
      scenarios: [
        {
          id: "base",
          name: "Base",
          revenueGrowthBps: 0,
          expenseGrowthBps: 0,
          assumptions: "Baseline",
        },
      ],
    };
    expect(() => forecastProjection(config, { revenueMinor: "0", expenseMinor: "0" }, [])).toThrow(
      "complete calendar months",
    );
    expect(() => forecastSchema.parse({ ...config, start: "2026-10-01" })).toThrow();
    expect(() =>
      forecastSchema.parse({ ...config, scenarios: [config.scenarios[0], config.scenarios[0]] }),
    ).toThrow();
  });
});
