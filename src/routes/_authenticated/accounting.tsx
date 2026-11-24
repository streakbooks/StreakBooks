import { ACCOUNTING_TABS, type AccountingSearch } from "@/lib/navigation/workspace-search";

import { createFileRoute, Outlet, redirect, useChildMatches } from "@tanstack/react-router";

import { parseChartBrowseSearch } from "@/lib/accounting/chart-browsing";
import { validPeriodDeepLink } from "@/lib/accounting/financial-years-review";
import { parseJournalBrowseSearch } from "@/lib/accounting/journal-browsing";

import { Accounting } from "@/screens/accounting";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting — StreakBooks" },
      {
        name: "description",
        content: "Chart of accounts, manual journals and the general ledger in StreakBooks.",
      },
    ],
  }),
  // `tab` and `journal` make report drill-downs, search hits and dashboard tasks deep-linkable.
  validateSearch: (raw: Record<string, unknown>): AccountingSearch => {
    const tab = raw["tab"];
    const journal = raw["journal"];
    return {
      ...parseJournalBrowseSearch(raw),
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
  beforeLoad: ({ location, search }) => {
    if (search.tab === "post" && /^\/accounting\/?$/.test(location.pathname)) {
      throw redirect({ to: "/accounting/journals/new", search: { mode: "post" }, replace: true });
    }
  },
  component: AccountingRoute,
});

function AccountingRoute() {
  const hasChild = useChildMatches({ select: (matches) => matches.length > 0 });
  return hasChild ? <Outlet /> : <Accounting />;
}
