import { describe, expect, it } from "vitest";
import {
  buildFinancialInsights,
  formatFinancialMetric,
  type FinancialSnapshot,
} from "./financial-insights";

function snapshot(
  overrides: Partial<FinancialSnapshot> = {},
  metricOverrides: Partial<FinancialSnapshot["metrics"]> = {},
): FinancialSnapshot {
  return {
    from: "2026-10-01",
    to: "2026-10-31",
    accountingBasis: "accrual",
    capturedAt: "2026-11-01T10:00:00.000Z",
    hasActivity: true,
    metrics: {
      revenue: { value: "100000", format: "money", reportId: "profit-and-loss" },
      gross_profit: { value: "75000", format: "money", reportId: "profit-and-loss" },
      net_profit: { value: "25000", format: "money", reportId: "profit-and-loss" },
      cash: { value: "40000", format: "money", reportId: "cash-summary" },
      working_capital: { value: "20000", format: "money", reportId: "balance-sheet" },
      current_ratio: { value: "15000", format: "ratio", reportId: "balance-sheet" },
      gross_margin: { value: "7500", format: "percent", reportId: "profit-and-loss" },
      net_margin: { value: "2500", format: "percent", reportId: "profit-and-loss" },
      ...metricOverrides,
    },
    ...overrides,
  };
}

describe("financial insights reuse exact financial report values", () => {
  it("formats monetary integers without IEEE-754 loss", () => {
    expect(formatFinancialMetric("900719925474099312", "money", "USD")).toBe(
      "USD 9007199254740993.12",
    );
    expect(formatFinancialMetric("-250", "money", "USD")).toBe("USD -2.50");
  });

  it("formats basis-point ratios and margin percentages, keeping unknowns unknown", () => {
    expect(formatFinancialMetric("15000", "ratio", "USD")).toBe("1.50×");
    expect(formatFinancialMetric("7333", "percent", "USD")).toBe("73.33%");
    expect(formatFinancialMetric(null, "ratio", "USD")).toBe("Not available");
    expect(formatFinancialMetric("nan", "money", "USD")).toBe("Not available");
  });

  it("keeps every metric traceable to an existing report and does not invent a source", () => {
    const out = buildFinancialInsights(snapshot(), null, "USD");
    expect(out.cards).toHaveLength(8);
    expect(out.cards.find((v) => v.id === "cash")).toMatchObject({
      value: "USD 400.00",
      sourceReportId: "cash-summary",
      priorValue: null,
      change: null,
    });
    expect(out.cards.find((v) => v.id === "current_ratio")?.value).toBe("1.50×");
    expect(out.comparable).toBe(false);
  });

  it("compares equal-length periods on the same accounting basis exactly", () => {
    const previous = snapshot(
      { from: "2026-08-31", to: "2026-09-30" },
      {
        revenue: { value: "120000", format: "money", reportId: "profit-and-loss" },
        net_profit: { value: "10000", format: "money", reportId: "profit-and-loss" },
        net_margin: { value: "833", format: "percent", reportId: "profit-and-loss" },
      },
    );
    const out = buildFinancialInsights(snapshot(), previous, "USD");
    expect(out.comparable).toBe(true);
    expect(out.cards.find((v) => v.id === "revenue")?.change).toBe("USD -200.00");
    expect(out.cards.find((v) => v.id === "net_profit")?.change).toBe("USD 150.00");
    expect(out.cards.find((v) => v.id === "net_margin")?.change).toBe("16.67 percentage points");
    expect(out.observations.map((v) => v.id)).toContain("revenue_decline");
  });

  it("does not compare mismatched periods or different basis", () => {
    const curr = snapshot();
    const wrongBasis = snapshot({ from: "2026-08-31", to: "2026-09-30", accountingBasis: "cash" });
    const wrongDuration = snapshot({ from: "2026-09-01", to: "2026-09-30" });
    for (const prior of [wrongBasis, wrongDuration]) {
      const out = buildFinancialInsights(curr, prior, "USD");
      expect(out.comparable).toBe(false);
      expect(out.cards.every((v) => v.change === null)).toBe(true);
    }
  });

  it("flags net loss, negative bank GL cash and weak working capital as review prompts only", () => {
    const out = buildFinancialInsights(
      snapshot({}, {
        net_profit: { value: "-12500", format: "money", reportId: "profit-and-loss" },
        cash: { value: "-21000", format: "money", reportId: "cash-summary" },
        working_capital: { value: "-5000", format: "money", reportId: "balance-sheet" },
        current_ratio: { value: "8000", format: "ratio", reportId: "balance-sheet" },
      }),
      null,
      "USD",
    );
    expect(out.observations.map((v) => v.id)).toEqual([
      "loss", "negative_cash", "working_capital", "current_ratio",
    ]);
    expect(out.observations.every((v) => v.sourceReportId && !/guaranteed|confirmed\s+overdraft/i.test(v.text))).toBe(true);
  });

  it("discloses missing period activity without misclassifying closing cash as missing", () => {
    const out = buildFinancialInsights(snapshot({ hasActivity: false }), null, "USD");
    expect(out.observations[0]?.id).toBe("no_activity");
    expect(out.cards.find((v) => v.id === "cash")?.value).toBe("USD 400.00");
  });

  it("does not assign revenue decline to a cause or claim the result was audited", () => {
    const current = snapshot();
    const prior = snapshot(
      { from: "2026-08-31", to: "2026-09-30" },
      { revenue: { value: "200000", format: "money", reportId: "profit-and-loss" } },
    );
    const finding = buildFinancialInsights(current, prior, "USD").observations.find(
      (v) => v.id === "revenue_decline",
    );
    expect(finding?.text).toContain("before attributing a cause");
    expect(finding?.sourceReportId).toBe("profit-and-loss");
  });

  it("fails closed on mismatched reporting provenance", () => {
    const out = buildFinancialInsights(snapshot({}, {
      cash: { value: "1000000", format: "money", reportId: "profit-and-loss" },
    }), null, "USD");
    expect(out.cards.find((v) => v.id === "cash")?.value).toBe("Not available");
    expect(out.observations.some((v) => v.id === "negative_cash")).toBe(false);
  });

  it("does not create an unavailable current ratio from zero-liability balances", () => {
    const out = buildFinancialInsights(
      snapshot({}, {
        current_ratio: { value: null, format: "ratio", reportId: "balance-sheet" },
      }),
      null,
      "USD",
    );
    expect(out.cards.find((v) => v.id === "current_ratio")?.value).toBe("Not available");
    expect(out.observations.some((v) => v.id === "current_ratio")).toBe(false);
  });
});
