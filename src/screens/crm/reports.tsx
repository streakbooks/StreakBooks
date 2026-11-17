import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getCrmDashboardKpis, getCrmForecastReport, getCrmSettings } from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";

export function CrmReportsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("crm.view" as Permission) ||
    can("crm.reports.view" as Permission) ||
    can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchKpis = useServerFn(getCrmDashboardKpis);
  const fetchForecast = useServerFn(getCrmForecastReport);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const kpis = useQuery({
    queryKey: ["crm-dashboard-kpis", company?.id, "reports"],
    queryFn: () => fetchKpis({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const forecast = useQuery({
    queryKey: ["crm-forecast-report", company?.id, "reports"],
    queryFn: () => fetchForecast({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="CRM Reports" description="Pipeline and conversion summaries.">
        <EmptyState
          title="No CRM access"
          description="Ask an administrator for crm.reports.view."
        />
      </ListWorkspace>
    );
  }

  const currency = company.base_currency || "USD";
  const kpi = kpis.data;
  const report = forecast.data;

  return (
    <ListWorkspace
      title="CRM Reports"
      description="Live CRM summaries. Forecast figures are expectations — not journalled revenue."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "CRM Reports" }]}
      actions={
        <Button asChild variant="secondary">
          <Link to="/crm/$section" params={{ section: "forecasting" }}>
            Open forecasting
          </Link>
        </Button>
      }
    >
      <CrmSubnav current="reports" />

      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM before running reports." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Reporting boundary</AlertTitle>
            <AlertDescription>
              Export snapshots and scheduled packs arrive later. These live totals reuse authorised
              CRM KPIs and stage-weighted forecast maths.
            </AlertDescription>
          </Alert>

          {kpis.isLoading || forecast.isLoading ? <LoadingState /> : null}
          {kpis.isError ? (
            <ErrorState
              title="Could not load KPI report"
              description={friendlyAuthError(kpis.error)}
              onRetry={() => kpis.refetch()}
            />
          ) : null}

          {kpi ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total leads</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{kpi.totalLeads}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Win rate</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {kpi.winRatePct == null ? "—" : `${kpi.winRatePct}%`}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Deals won</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{kpi.dealsWon}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Stagnant deals</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{kpi.stagnantDeals}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Past stale-deal threshold in settings.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {report ? (
            <Card>
              <CardHeader>
                <CardTitle>Weighted pipeline (live)</CardTitle>
                <CardDescription>{report.note}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Open deals</p>
                  <p className="text-2xl font-semibold tabular-nums">{report.openDealCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pipeline</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCrmMinor(report.pipelineValueMinor, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weighted</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCrmMinor(report.weightedPipelineValueMinor, currency)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
