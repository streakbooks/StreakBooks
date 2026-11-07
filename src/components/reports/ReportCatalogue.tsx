import { useMemo } from "react";
import { useReportingCentreOrigin } from "@/hooks/use-reporting-centre-origin";
import { Link } from "@tanstack/react-router";
import {
  QUICK_REPORT_IDS,
  REPORT_CATALOG,
  nonEmptyCategories,
  searchReports,
  type ReportCategoryId,
} from "@/lib/reports/catalog";
import { EmptyState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ReportDirectory } from "./ReportDirectory";

export type CatalogueFilters = { query: string; category: ReportCategoryId | "all" };

/** Browse the existing catalogue without changing report authorization or execution. */
export function ReportCatalogue({
  query,
  category,
  from,
  to,
  onChange,
}: CatalogueFilters & {
  from: string;
  to: string;
  onChange: (filters: CatalogueFilters) => void;
}) {
  const centre = useReportingCentreOrigin();
  const categories = nonEmptyCategories();
  const filtered = useMemo(
    () =>
      searchReports(query).filter((report) => category === "all" || report.category === category),
    [query, category],
  );
  return (
    <section aria-label="Report catalogue" className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Browse reports</h2>
        <p className="text-sm text-muted-foreground">
          Choose a category or search for a report. Each report opens in its own workspace.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Popular
        </span>
        {QUICK_REPORT_IDS.map((id) => {
          const r = REPORT_CATALOG.find((x) => x.id === id);
          if (!r) return null;
          return (
            <Button key={id} asChild variant="secondary" size="sm">
              <Link to="/reports/$reportId" params={{ reportId: id }} search={{ from, to, centre }}>
                {r.title}
              </Link>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="report-search">Search reports</Label>
          <Input
            id="report-search"
            maxLength={120}
            value={query}
            onChange={(e) => onChange({ query: e.target.value, category })}
            placeholder="Profit and loss, aged receivables, tax…"
          />
        </div>
        <div className="w-full space-y-2 sm:w-64">
          <Label htmlFor="report-category">Category</Label>
          <select
            id="report-category"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:h-11"
            value={category}
            onChange={(e) =>
              onChange({ query, category: e.target.value as ReportCategoryId | "all" })
            }
          >
            {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "report" : "reports"} found
        </p>
        {(query || category !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ query: "", category: "all" })}
          >
            Clear filters
          </Button>
        )}
      </div>
      <ReportDirectory reports={filtered} from={from} to={to} centre={centre} />

      {filtered.length === 0 && (
        <EmptyState
          title="No matching reports"
          description="Try another search term or clear the filters."
        />
      )}
    </section>
  );
}
