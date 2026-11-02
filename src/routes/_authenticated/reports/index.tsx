import { parseReportingCentreSearch } from "@/lib/reports/centre-search";
import { nativeTabLinkClass } from "@/lib/navigation/native-tab";
import { ReportingFeatureGate } from "@/components/reports/ReportingFeatureGate";
import { ManagementWorkspace } from "@/components/reports/ManagementWorkspace";
import { ReportPacksWorkspace } from "@/components/reports/ReportPacksWorkspace";
import { AdviserReporting } from "@/components/reports/AdviserReporting";
import { ReportingHome } from "@/components/reports/ReportingHome";
import { fiscalYearStart, todayIso } from "@/lib/accounting/fiscal-year";
import { ReportLibrary } from "@/components/reports/ReportLibrary";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  QUICK_REPORT_IDS,
  REPORT_CATALOG,
  nonEmptyCategories,
  searchReports,
  type ReportCategoryId,
} from "@/lib/reports/catalog";
import { PageHeader, EmptyState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Reports Centre — LinkBooks" },
      {
        name: "description",
        content:
          "Searchable catalogue of financial and operational reports from the posted ledger.",
      },
    ],
  }),
  component: ReportsCentre,
  validateSearch: parseReportingCentreSearch,
});

function ReportsCentre() {
  const { company, isPending } = useActiveCompany();
  const [q, setQ] = useState("");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = search.tab ?? "home";
  const periodFrom = search.from ?? "";
  const periodTo = search.to ?? todayIso();
  const setPeriodFrom = (value: string) =>
    void navigate({
      search: (previous) => parseReportingCentreSearch({ ...previous, from: value }),
      replace: true,
    });
  const setPeriodTo = (value: string) =>
    void navigate({
      search: (previous) => parseReportingCentreSearch({ ...previous, to: value }),
      replace: true,
    });
  const [category, setCategory] = useState<ReportCategoryId | "all">("all");

  const searched = useMemo(() => searchReports(q), [q]);
  // Only categories that still have a matching report are offered or shown (RP-10).
  const categories = useMemo(() => nonEmptyCategories(searched), [searched]);
  const filtered = useMemo(
    () => (category === "all" ? searched : searched.filter((r) => r.category === category)),
    [searched, category],
  );
  const visibleCategories = categories.filter((c) => filtered.some((r) => r.category === c.id));

  const readyCount = REPORT_CATALOG.filter((r) => r.status === "ready").length;

  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <EmptyState
        title="No organisation selected"
        description="Open an organisation to use the Reports Centre."
      />
    );
  }

  const from =
    periodFrom ||
    fiscalYearStart(periodTo, company.fiscal_year_end_month, company.fiscal_year_end_day ?? 31);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports Centre"
        description={`Financial statements, saved reports and performance analysis for ${company.name}. ${readyCount} reports connected to your accounting records.`}
      />

      <div className="flex flex-wrap gap-3">
        <div>
          <Label htmlFor="centre-from">Reporting period from</Label>
          <Input
            id="centre-from"
            type="date"
            value={from}
            onChange={(e) => setPeriodFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="centre-to">Reporting period to</Label>
          <Input
            id="centre-to"
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </div>
      </div>
      <Tabs value={tab} className="space-y-6">
        <div className="overflow-x-auto">
          <TabsList aria-label="Reporting modules" className="w-max">
            {([
              ["home", "Reporting home"],
              ["standard", "Standard reports"],
              ["custom", "Custom reports"],
              ["management", "Management reports"],
              ["packs", "Report packs"],
              ["adviser", "Adviser"],
              ["drafts", "Drafts & review"],
              ["published", "Published"],
              ["archived", "Archived"],
              ["schedules", "Scheduled delivery"],
              ["templates", "Templates"],
            ] as const).map(([id, label]) => (
              <Link
                key={id}
                role="tab"
                aria-selected={tab === id}
                data-state={tab === id ? "active" : "inactive"}
                to="/reports"
                search={{ ...search, tab: id, pack: undefined }}
                className={nativeTabLinkClass}
                resetScroll={false}
              >
                {label}
              </Link>
            ))}
          </TabsList>
        </div>
        {tab !== "standard" && (
          <ReportingFeatureGate companyId={company.id}>
            <TabsContent value="home">
              <ReportingHome
                key={company.id}
                companyId={company.id}
                from={from}
                to={periodTo}
              />
            </TabsContent>
            <TabsContent value="adviser">
              <AdviserReporting from={from} to={periodTo} />
            </TabsContent>
            {(["packs", "drafts", "published", "archived", "schedules"] as const).map((value) => (
              <TabsContent key={value} value={value}>
                <ReportPacksWorkspace
                  key={`${company.id}-${value}`}
                  companyId={company.id}
                  from={from}
                  to={periodTo}
                  selectedPackId={search.pack ?? null}
                  onSelectPack={(id) => void navigate({
                    to: "/reports",
                    search: (previous) => ({ ...previous, pack: id ?? undefined }),
                  })}
                  filter={
                    value === "drafts" || value === "published" || value === "archived"
                      ? value
                      : "all"
                  }
                />
                {value === "archived" && (
                  <ReportLibrary
                    key={`${company.id}-archived`}
                    companyId={company.id}
                    initialState="archived"
                  />
                )}
              </TabsContent>
            ))}
            <TabsContent value="templates">
              <ReportLibrary
                key={`${company.id}-templates`}
                companyId={company.id}
                initialState="templates"
              />
            </TabsContent>
            <TabsContent value="custom">
              <ReportLibrary key={company.id} companyId={company.id} />
            </TabsContent>
            <TabsContent value="management">
              <ManagementWorkspace
                key={company.id}
                companyId={company.id}
                from={from}
                to={periodTo}
              />
              <div className="mt-4 flex gap-2">
                <Button asChild variant="outline">
                  <Link to="/budgets">Budget workspace</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link
                    to="/reports/$reportId"
                    params={{ reportId: "budget-vs-actual" }}
                    search={{ from, to: periodTo }}
                  >
                    Budget versus Actual
                  </Link>
                </Button>
              </div>
            </TabsContent>
          </ReportingFeatureGate>
        )}
        <TabsContent value="standard" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {QUICK_REPORT_IDS.map((id) => {
              const r = REPORT_CATALOG.find((x) => x.id === id);
              if (!r) return null;
              return (
                <Button key={id} asChild variant="secondary" size="sm">
                  <Link to="/reports/$reportId" params={{ reportId: id }}>
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
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Profit and loss, aged receivables, tax…"
              />
            </div>
            <div className="w-full space-y-2 sm:w-64">
              <Label htmlFor="report-category">Category</Label>
              <select
                id="report-category"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:h-11"
                value={category}
                onChange={(e) => setCategory(e.target.value as ReportCategoryId | "all")}
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

          {visibleCategories.map((cat) => {
            const rows = filtered.filter((r) => r.category === cat.id);
            return (
              <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="space-y-3">
                <h2
                  id={`cat-${cat.id}`}
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {cat.label}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((report) => (
                    <Card
                      key={report.id}
                      className={
                        report.status === "depends"
                          ? "bg-muted/30"
                          : "transition-shadow hover:shadow-raised"
                      }
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{report.title}</CardTitle>
                          <Badge variant={report.status === "ready" ? "success" : "warning"}>
                            {report.status === "ready" ? "Ready" : "Depends"}
                          </Badge>
                        </div>
                        <CardDescription>{report.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {report.status === "depends" ? (
                          <p className="text-sm text-warning-ink">{report.dependency}</p>
                        ) : report.runner === "link" && report.linkTo ? (
                          <Button asChild size="sm">
                            <Link to={report.linkTo}>Open</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm">
                            <Link to="/reports/$reportId" params={{ reportId: report.id }}>
                              Open report
                            </Link>
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}

          {filtered.length === 0 ? (
            <EmptyState
              title="No matching reports"
              description="Try another search term or clear the category filter."
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
