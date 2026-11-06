import { Link } from "@tanstack/react-router";
import { CalendarClock, Calculator, ClipboardCheck, LayoutList } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { buildAssetPortfolioSnapshot } from "@/lib/fixed-assets/portfolio-dashboard";
import type { AssetTypeRow, FixedAssetRow } from "@/lib/fixed-assets/fixed-assets.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AssetPortfolioPanel({
  assets,
  types,
  currency,
  asOf,
  balances,
  balancesLoading,
  onView,
}: {
  assets: readonly FixedAssetRow[];
  types: readonly AssetTypeRow[];
  currency: string;
  asOf: string;
  balances: ReadonlyMap<string, number> | null;
  balancesLoading: boolean;
  onView: (asset: FixedAssetRow) => void;
}) {
  const fmt = useFormat();
  const portfolio = buildAssetPortfolioSnapshot(assets, types, asOf, balances);
  const costMetrics = [
    {
      label: "Active registered assets",
      value: String(portfolio.activeCount),
      note: "Excludes disposed and future purchases",
    },
    {
      label: "Registered acquisition cost",
      value: fmt.money(portfolio.costMinor, currency),
      note: "Active assets · not a GL balance",
    },
    {
      label: "Recorded accumulated",
      value: portfolio.accumulatedMinor === null
        ? balancesLoading ? "Loading…" : "Unavailable"
        : fmt.money(portfolio.accumulatedMinor, currency),
      note: "As-at register balances only",
    },
    {
      label: "Cost less recorded depreciation",
      value: portfolio.netBookValueMinor === null
        ? balancesLoading ? "Loading…" : "Unavailable"
        : fmt.money(portfolio.netBookValueMinor, currency),
      note: "Check against Reconcile to GL",
    },
  ];
  const activityMetrics = [
    {
      label: "Acquired this month",
      value: portfolio.acquiredThisMonth,
      note: "Based on purchase date in register",
    },
    {
      label: "Disposed this month",
      value: portfolio.disposedThisMonth,
      note: "Register disposal dates",
    },
    {
      label: "Possible overdue depreciation",
      value: portfolio.possibleDepreciationOverdue,
      note: "Review through prior month; not an amount due",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fixed Assets overview</h2>
          <p className="text-sm text-muted-foreground">
            Portfolio at {fmt.date(asOf)}. Figures are from the asset register, not a
            replacement for the posted general ledger or an impairment review.
          </p>
        </div>
        <Badge variant="outline">{currency} · Register snapshot</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Portfolio overview metrics">
        {costMetrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Portfolio activity">
        {activityMetrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {metric.value === null
                ? balancesLoading ? "Loading…" : "Unavailable"
                : metric.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
          </div>
        ))}
      </div>

      <nav aria-label="Fixed Assets workflows" className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to="/fixed-assets" search={{ tab: "register" }}>
            <LayoutList className="mr-2 size-4" /> View register
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/fixed-assets" search={{ tab: "depreciation" }}>
            <CalendarClock className="mr-2 size-4" /> Run depreciation
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/fixed-assets" search={{ tab: "reconciliation" }}>
            <Calculator className="mr-2 size-4" /> Reconcile to GL
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/fixed-assets" search={{ tab: "bill-review" }}>
            <ClipboardCheck className="mr-2 size-4" /> Review bill purchases
          </Link>
        </Button>
      </nav>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 space-y-3 rounded-xl border p-4 sm:p-5" aria-label="Assets by category">
          <div>
            <h3 className="font-semibold">Acquisition cost by asset type</h3>
            <p className="text-xs text-muted-foreground">
              Active register cost, grouped by the asset's current type; not GL balances.
            </p>
          </div>
          {portfolio.categoryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active registered assets to group.
            </p>
          ) : (
            <div className="space-y-4">
              {portfolio.categoryRows.map((row) => (
                <div key={row.key} className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words font-medium">{row.name} ({row.count})</span>
                    <span className="font-medium tabular-nums">{fmt.money(row.costMinor, currency)}</span>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={row.name + ": " + (row.shareBps / 100).toFixed(2) + "% of active cost"}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: (row.shareBps / 100).toString() + "%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-3 rounded-xl border p-4 sm:p-5" aria-label="Recently acquired assets">
          <div>
            <h3 className="font-semibold">Recently acquired assets</h3>
            <p className="text-xs text-muted-foreground">
              Latest six purchases by register date, including assets later disposed of.
            </p>
          </div>
          {portfolio.recentAcquisitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets acquired by this date.</p>
          ) : (
            <ul className="divide-y">
              {portfolio.recentAcquisitions.map((asset) => (
                <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="block break-words text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => onView(asset)}
                    >
                      {asset.asset_number} · {asset.name}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Purchased {fmt.date(asset.purchase_date)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {fmt.money(asset.cost_minor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Possible overdue depreciation is a review indicator only. It excludes fully depreciated
        assets, non-depreciating assets and new starts this month. It can only be calculated when
        all active assets have valid register balances; verify posting periods before taking action.
      </p>
    </div>
  );
}
