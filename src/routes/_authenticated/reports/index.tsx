import { REPORT_CATALOG } from "@/lib/reports/catalog";
import { parseReportingCentreSearch } from "@/lib/reports/centre-search";
import { encodeReportingCentreContext } from "@/lib/reports/centre-return";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { ReportingFeatureGate } from "@/components/reports/ReportingFeatureGate";
import { ManagementWorkspace } from "@/components/reports/ManagementWorkspace";
import { ReportPacksWorkspace } from "@/components/reports/ReportPacksWorkspace";
import { AdviserReporting } from "@/components/reports/AdviserReporting";
import { ReportingHome } from "@/components/reports/ReportingHome";
import { fiscalYearStart, todayIso } from "@/lib/accounting/fiscal-year";
import { ReportLibrary } from "@/components/reports/ReportLibrary";
import { ReportCatalogue } from "@/components/reports/ReportCatalogue";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  // Defensive validation also handles router search state inherited from external URLs.
  const search = parseReportingCentreSearch(Route.useSearch() as Record<string, unknown>);
  const centre = encodeReportingCentreContext(search);
  const navigate = Route.useNavigate();
  const tab = search.tab ?? "standard";
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
  const readyCount = REPORT_CATALOG.filter((r) => r.status === "ready").length;
  return (
    <ListWorkspace
      title="Reports Centre"
      description={`Financial statements, saved reports and performance analysis for ${company.name}. ${readyCount} reports connected to your accounting records.`}
    >
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
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="min-w-0 max-w-full overflow-x-auto">
            <TabsList
              onKeyDown={handleNativeTabKeyDown}
              aria-label="Reporting modules"
              className="w-max"
            >
              {(
                [
                  ["standard", "All reports"],
                  ["home", "Overview"],
                  ["custom", "Saved & custom"],
                  ["management", "Management"],
                  ["packs", "Report packs"],
                  ["adviser", "Adviser"],
                ] as const
              ).map(([id, label]) => (
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={
                  ["drafts", "published", "archived", "schedules", "templates"].includes(tab)
                    ? "secondary"
                    : "outline"
                }
                size="sm"
              >
                Workflow tools <ChevronDown className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                [
                  ["drafts", "Drafts & review"],
                  ["published", "Published reports"],
                  ["archived", "Archived reports"],
                  ["schedules", "Scheduled delivery"],
                  ["templates", "Templates"],
                ] as const
              ).map(([id, label]) => (
                <DropdownMenuItem key={id} asChild>
                  <Link to="/reports" search={{ ...search, tab: id, pack: undefined }}>
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {tab !== "standard" && (
          <ReportingFeatureGate companyId={company.id}>
            <TabsContent value="home">
              <ReportingHome key={company.id} companyId={company.id} from={from} to={periodTo} />
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
                  onSelectPack={(id) =>
                    void navigate({
                      to: "/reports",
                      search: (previous) => ({ ...previous, pack: id ?? undefined }),
                    })
                  }
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
                onPeriodChange={(range) =>
                  void navigate({
                    search: (previous) => parseReportingCentreSearch({ ...previous, ...range }),
                    replace: true,
                    resetScroll: false,
                  })
                }
              />
              <div className="mt-4 flex gap-2">
                <Button asChild variant="outline">
                  <Link to="/budgets">Budget workspace</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link
                    to="/reports/$reportId"
                    params={{ reportId: "budget-vs-actual" }}
                    search={{ from, to: periodTo, centre }}
                  >
                    Budget versus Actual
                  </Link>
                </Button>
              </div>
            </TabsContent>
          </ReportingFeatureGate>
        )}
        <TabsContent value="standard" className="space-y-6">
          <ReportCatalogue
            query={search.query ?? ""}
            category={search.category ?? "all"}
            from={from}
            to={periodTo}
            onChange={({ query, category }) =>
              void navigate({
                search: (previous) => parseReportingCentreSearch({ ...previous, query, category }),
                replace: true,
                resetScroll: false,
              })
            }
          />
        </TabsContent>
      </Tabs>
    </ListWorkspace>
  );
}
