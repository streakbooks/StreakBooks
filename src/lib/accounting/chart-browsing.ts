const chartClasses = ["all", "asset", "liability", "equity", "income", "expense"] as const;
const chartStatuses = ["active", "archived", "all"] as const;
const chartBalances = ["all", "nonzero", "zero"] as const;
const chartLayouts = ["tree", "flat"] as const;
const chartSortKeys = ["code", "name", "type", "balance", "activity"] as const;

export type ChartBrowseSearch = {
  chartQ?: string | undefined;
  chartClass?: (typeof chartClasses)[number] | undefined;
  chartStatus?: (typeof chartStatuses)[number] | undefined;
  chartBalance?: (typeof chartBalances)[number] | undefined;
  chartLayout?: (typeof chartLayouts)[number] | undefined;
  chartActivity?: "transactions" | undefined;
  chartSort?: (typeof chartSortKeys)[number] | undefined;
  chartDir?: "desc" | undefined;
};

export function parseChartBrowseSearch(raw: Record<string, unknown>): ChartBrowseSearch {
  const query = raw["chartQ"];
  return {
    chartQ: typeof query === "string" && query.length > 0 ? query.slice(0, 120) : undefined,
    chartClass: chartClasses.find((value) => value !== "all" && value === raw["chartClass"]),
    chartStatus: chartStatuses.find((value) => value !== "active" && value === raw["chartStatus"]),
    chartBalance: chartBalances.find((value) => value !== "all" && value === raw["chartBalance"]),
    chartLayout: raw["chartLayout"] === "flat" ? "flat" : undefined,
    chartActivity: raw["chartActivity"] === "transactions" ? "transactions" : undefined,
    chartSort: chartSortKeys.find((value) => value === raw["chartSort"]),
    chartDir: raw["chartDir"] === "desc" ? "desc" : undefined,
  };
}
