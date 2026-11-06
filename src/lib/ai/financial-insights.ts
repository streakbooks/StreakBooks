import { fromMinorUnits } from "@/lib/accounting/money";

/**
 * Presentation-only insights built from getManagementMetrics' captured report facts.
 * Do not independently compute revenue, profit, cash, or balances from raw journals here.
 */
export const FINANCIAL_METRICS = [
  { id: "revenue", label: "Revenue", format: "money", source: "profit-and-loss", description: "Net posted income for the selected period." },
  { id: "gross_profit", label: "Gross profit", format: "money", source: "profit-and-loss", description: "Revenue after cost of sales for the selected period." },
  { id: "net_profit", label: "Net profit", format: "money", source: "profit-and-loss", description: "Net income less expenses for the selected period." },
  { id: "cash", label: "Bank GL balances", format: "money", source: "cash-summary", description: "Closing company bank general-ledger balances as of the end date; not bank-feed balances." },
  { id: "working_capital", label: "Working capital", format: "money", source: "balance-sheet", description: "Current assets less current liabilities as of the end date." },
  { id: "current_ratio", label: "Current ratio", format: "ratio", source: "balance-sheet", description: "Current assets divided by current liabilities; unavailable when liabilities are not positive." },
  { id: "gross_margin", label: "Gross margin", format: "percent", source: "profit-and-loss", description: "Gross profit divided by net revenue, when revenue is positive." },
  { id: "net_margin", label: "Net margin", format: "percent", source: "profit-and-loss", description: "Net profit divided by net revenue, when revenue is positive." },
] as const;

export type FinancialMetricId = (typeof FINANCIAL_METRICS)[number]["id"];
export type FinancialSourceId = (typeof FINANCIAL_METRICS)[number]["source"];
export type FinancialMetric = {
  value: string | null;
  format: string;
  reportId: string;
};
export type FinancialSnapshot = {
  from: string;
  to: string;
  accountingBasis: string;
  capturedAt: string;
  hasActivity: boolean;
  metrics: Record<FinancialMetricId, FinancialMetric>;
};

export type FinancialCard = {
  id: FinancialMetricId;
  label: string;
  value: string;
  priorValue: string | null;
  change: string | null;
  sourceReportId: FinancialSourceId;
  description: string;
};
export type FinancialObservation = {
  id: string;
  text: string;
  sourceReportId: FinancialSourceId;
};

function decimal2(value: bigint, scale: bigint): string {
  // Exact bigint rounding to two decimals avoids corrupting large money amounts.
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const rounded = (absolute * 100n + scale / 2n) / scale;
  return (negative ? "-" : "") + (rounded / 100n).toString() + "." + (rounded % 100n).toString().padStart(2, "0");
}

/** Ratios/percentages from getManagementMetrics use integer basis points. */
export function formatFinancialMetric(
  amount: string | null,
  format: "money" | "ratio" | "percent",
  currency: string,
): string {
  if (amount === null || !/^-?\d+$/.test(amount)) return "Not available";
  const value = BigInt(amount);
  if (format === "money") return currency + " " + fromMinorUnits(value, currency);
  if (format === "ratio") return decimal2(value, 10_000n) + "×";
  return decimal2(value, 100n) + "%";
}

function metricRaw(snapshot: FinancialSnapshot, key: FinancialMetricId): bigint | null {
  const source = FINANCIAL_METRICS.find((item) => item.id === key)!;
  const metric = snapshot.metrics[key];
  // Fail closed if a changed reporting API no longer matches this documented source.
  if (!metric || metric.format !== source.format || metric.reportId !== source.source) return null;
  const value = metric.value;
  return typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : null;
}

function datesAreComparable(current: FinancialSnapshot, previous: FinancialSnapshot): boolean {
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !valid.test(current.from) ||
    !valid.test(current.to) ||
    !valid.test(previous.from) ||
    !valid.test(previous.to) ||
    current.accountingBasis !== previous.accountingBasis ||
    previous.to >= current.from
  ) return false;
  const days = (from: string, to: string) =>
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000;
  return days(current.from, current.to) === days(previous.from, previous.to);
}

/**
 * Comparisons are absolute only; causal attribution, growth percentages and
 * bank-flow claims are deliberately excluded. Source links point to Reports.
 */
export function buildFinancialInsights(
  current: FinancialSnapshot,
  previous: FinancialSnapshot | null,
  currency: string,
): { cards: FinancialCard[]; observations: FinancialObservation[]; comparable: boolean } {
  const comparable = Boolean(previous && datesAreComparable(current, previous));
  const cards = FINANCIAL_METRICS.map((def) => {
    const actual = metricRaw(current, def.id);
    const prior = comparable && previous ? metricRaw(previous, def.id) : null;
    const change = actual !== null && prior !== null ? actual - prior : null;
    return {
      id: def.id,
      label: def.label,
      value: formatFinancialMetric(actual === null ? null : actual.toString(), def.format, currency),
      priorValue: prior === null ? null : formatFinancialMetric(prior.toString(), def.format, currency),
      change: change === null ? null : formatFinancialMetric(change.toString(), def.format, currency),
      sourceReportId: def.source,
      description: def.description,
    };
  });
  const observations: FinancialObservation[] = [];
  const netProfit = metricRaw(current, "net_profit");
  const workingCapital = metricRaw(current, "working_capital");
  const cash = metricRaw(current, "cash");
  const ratio = metricRaw(current, "current_ratio");
  const revenue = metricRaw(current, "revenue");

  if (!current.hasActivity) {
    observations.push({
      id: "no_activity",
      text: "No posted period activity was captured for these dates. Closing balance-sheet and bank GL values may still exist.",
      sourceReportId: "profit-and-loss",
    });
  }
  if (current.hasActivity && netProfit !== null && netProfit < 0n) {
    observations.push({
      id: "loss",
      text: "The selected period shows a net loss. Review the Profit and Loss report for the underlying accounts; the cause is not established by this summary.",
      sourceReportId: "profit-and-loss",
    });
  }
  if (cash !== null && cash < 0n) {
    observations.push({
      id: "negative_cash",
      text: "The combined bank general-ledger closing balance is negative. Review the Cash Summary and reconciliation; this does not confirm an overdraft at every bank.",
      sourceReportId: "cash-summary",
    });
  }
  if (workingCapital !== null && workingCapital < 0n) {
    observations.push({
      id: "working_capital",
      text: "Current liabilities exceed current assets at the selected end date. Review their composition in the Balance Sheet.",
      sourceReportId: "balance-sheet",
    });
  }
  if (ratio !== null && ratio < 10_000n) {
    observations.push({
      id: "current_ratio",
      text: "Current assets are below current liabilities on the reported basis. The current ratio alone is not a complete liquidity assessment.",
      sourceReportId: "balance-sheet",
    });
  }
  if (comparable && previous && current.hasActivity && previous.hasActivity) {
    const priorRevenue = metricRaw(previous, "revenue");
    if (revenue !== null && priorRevenue !== null && revenue < priorRevenue) {
      observations.push({
        id: "revenue_decline",
        text: "Revenue is lower than in the preceding equal-length period. Investigate sales mix, timing, credit notes and cut-off before attributing a cause.",
        sourceReportId: "profit-and-loss",
      });
    }
  }
  if (observations.length === 0) {
    observations.push({
      id: "review",
      text: "No configured review triggers were detected. This is not an audit conclusion; inspect source reports for completeness, accuracy and reconciliation.",
      sourceReportId: "profit-and-loss",
    });
  }
  return { cards, observations, comparable };
}
