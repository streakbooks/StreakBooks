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

describe("forecast expense and profit comparisons", () => {
  const config = forecastSchema.parse({
    start: "2026-11-01",
    months: 2,
    baselineFrom: "2026-10-01",
    baselineTo: "2026-10-31",
    scenarios: [
      {
        id: "base",
        name: "Base",
        revenueGrowthBps: 0,
        expenseGrowthBps: 0,
        assumptions: "No growth",
      },
    ],
  });
  it("reconciles actual profit and all variances with exact signed arithmetic", () => {
    const rows = forecastProjection(config, { revenueMinor: "10000", expenseMinor: "6000" }, [
      { month: "2026-11-01", revenueMinor: "12000", expenseMinor: "5000" },
    ])[0]!.rows;
    expect(rows[0]).toMatchObject({
      actualProfitMinor: "7000",
      revenueVarianceMinor: "2000",
      revenueVarianceBps: "2000",
      expenseVarianceMinor: "-1000",
      expenseVarianceBps: "-1667",
      profitVarianceMinor: "3000",
      profitVarianceBps: "7500",
    });
    expect(rows[1]).toMatchObject({
      actualProfitMinor: null,
      expenseVarianceMinor: null,
      expenseVarianceBps: null,
      profitVarianceMinor: null,
      profitVarianceBps: null,
    });
  });
  it("uses absolute denominators for projected losses and leaves zero-denominator percentages unavailable", () => {
    const row = forecastProjection(config, { revenueMinor: "0", expenseMinor: "6000" }, [
      { month: "2026-11-01", revenueMinor: "0", expenseMinor: "3000" },
    ])[0]!.rows[0]!;
    expect(row).toMatchObject({
      revenueVarianceBps: null,
      actualProfitMinor: "-3000",
      profitVarianceMinor: "3000",
      profitVarianceBps: "5000",
      expenseVarianceBps: "-5000",
    });
    const zero = forecastProjection(config, { revenueMinor: "0", expenseMinor: "0" }, [
      { month: "2026-11-01", revenueMinor: "0", expenseMinor: "0" },
    ])[0]!.rows[0]!;
    expect(zero.actualProfitMinor).toBe("0");
    expect(zero.profitVarianceMinor).toBe("0");
    expect(zero.profitVarianceBps).toBeNull();
  });
  it("preserves amounts beyond Number precision", () => {
    const row = forecastProjection(
      config,
      { revenueMinor: "900719925474099301", expenseMinor: "900719925474099300" },
      [
        {
          month: "2026-11-01",
          revenueMinor: "900719925474099304",
          expenseMinor: "900719925474099300",
        },
      ],
    )[0]!.rows[0]!;
    expect(row.actualProfitMinor).toBe("4");
    expect(row.profitVarianceMinor).toBe("3");
    expect(row.profitVarianceBps).toBe("30000");
  });
});
