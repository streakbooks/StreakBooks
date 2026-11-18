import { ACCOUNTING_TABS, type AccountingSearch } from "@/lib/navigation/workspace-search";

import { createFileRoute } from "@tanstack/react-router";

import { parseChartBrowseSearch } from "@/lib/accounting/chart-browsing";
import { validPeriodDeepLink } from "@/lib/accounting/financial-years-review";

import { Accounting } from "@/screens/accounting";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting — LinkBooks" },
      {
        name: "description",
        content: "Chart of accounts, manual journals and the general ledger in LinkBooks.",
      },
    ],
  }),
  // `tab` and `journal` make report drill-downs, search hits and dashboard tasks deep-linkable.
  validateSearch: (raw: Record<string, unknown>): AccountingSearch => {
    const tab = raw["tab"];
    const journal = raw["journal"];
    return {
      ...parseChartBrowseSearch(raw),
      tab: ACCOUNTING_TABS.find((t) => t === tab),
      journal: typeof journal === "string" && journal ? journal : undefined,
      period: validPeriodDeepLink(raw["period"]),
      cashReview:
        typeof raw["cashReview"] === "string" && raw["cashReview"].length <= 8000
          ? raw["cashReview"]
          : undefined,
    };
  },
  component: Accounting,
});
