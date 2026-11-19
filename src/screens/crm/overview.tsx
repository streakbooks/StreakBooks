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
import { getCrmDashboardKpis, getCrmSettings } from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";

function KpiCard({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string | number;
  hint: string;
  to?: {
    section:
      "leads" | "opportunities" | "activities" | "tasks" | "forecasting" | "reports" | "calendar";
  };
}) {
  const body = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
  if (!to) return body;
  return (
    <Link
      to="/crm/$section"
      params={{ section: to.section }}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

export function CrmOverviewPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canOpen = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchKpis = useServerFn(getCrmDashboardKpis);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  const kpis = useQuery({
    queryKey: ["crm-dashboard-kpis", company?.id],
    queryFn: () => fetchKpis({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace title="CRM" description="Leads, pipelines and customer relationships.">
        <EmptyState
          title="No CRM access"
          description="Ask an administrator for crm.view permission."
        />
      </ListWorkspace>
    );
  }

  const currency = company.base_currency || "USD";

  return (
    <ListWorkspace
      title="CRM"
      description="Sales pipeline expectations — separate from posted accounting revenue."
      breadcrumbs={[{ label: "CRM" }]}
      actions={
        can("crm.leads.manage" as Permission) ? (
          <Button asChild>
            <Link to="/crm/$section" params={{ section: "leads" }}>
              Manage leads
            </Link>
          </Button>
        ) : undefined
      }
      subnav={<CrmSubnav current="overview" />}
    >
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <ErrorState
          title="Could not load CRM settings"
          description={friendlyAuthError(settings.error)}
          onRetry={() => settings.refetch()}
        />
      ) : null}

      {settings.data && !settings.data.enabled ? (
        <Alert>
          <AlertTitle>CRM is not enabled</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Enable CRM in settings to create leads and opportunities. Contacts and Sales stay
              unchanged until you convert a lead.
            </span>
            {can("crm.admin" as Permission) ? (
              <Button asChild variant="secondary">
                <Link to="/crm/$section" params={{ section: "settings" }}>
                  Open CRM Settings
                </Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {settings.data?.enabled ? (
        <>
          {kpis.isLoading ? <LoadingState /> : null}
          {kpis.isError ? (
            <ErrorState
              title="Could not load CRM dashboard"
              description={friendlyAuthError(kpis.error)}
              onRetry={() => kpis.refetch()}
            />
          ) : null}
          {kpis.data ? (
            <div className="space-y-6">
              <Alert>
                <AlertTitle>Forecast vs accounting</AlertTitle>
                <AlertDescription>{kpis.data.note}</AlertDescription>
              </Alert>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Open leads"
                  value={kpis.data.totalLeads}
                  hint="Not converted or disqualified"
                  to={{ section: "leads" }}
                />
                <KpiCard
                  label="New leads"
                  value={kpis.data.newLeads}
                  hint="Created in current range"
                  to={{ section: "leads" }}
                />
                <KpiCard
                  label="Qualified"
                  value={kpis.data.qualifiedLeads}
                  hint="Ready for conversion"
                  to={{ section: "leads" }}
                />
                <KpiCard
                  label="Unassigned"
                  value={kpis.data.unassignedLeads}
                  hint="Need an owner"
                  to={{ section: "leads" }}
                />
                <KpiCard
                  label="Active opportunities"
                  value={kpis.data.activeOpportunities}
                  hint="Open deals"
                  to={{ section: "opportunities" }}
                />
                <KpiCard
                  label="Pipeline value"
                  value={formatCrmMinor(kpis.data.pipelineValueMinor, currency)}
                  hint="Sum of open deal amounts"
                  to={{ section: "opportunities" }}
                />
                <KpiCard
                  label="Weighted pipeline"
                  value={formatCrmMinor(kpis.data.weightedPipelineValueMinor, currency)}
                  hint="Amount × stage probability"
                  to={{ section: "opportunities" }}
                />
                <KpiCard
                  label="Expected deal value"
                  value={formatCrmMinor(kpis.data.expectedDealValueMinor, currency)}
                  hint="Same as weighted open pipeline"
                  to={{ section: "forecasting" }}
                />
                <KpiCard
                  label="Won / Lost"
                  value={`${kpis.data.dealsWon} / ${kpis.data.dealsLost}`}
                  hint="Closed in current range"
                  to={{ section: "opportunities" }}
                />
                <KpiCard
                  label="Win rate"
                  value={kpis.data.winRatePct == null ? "—" : `${kpis.data.winRatePct}%`}
                  hint="Won ÷ (won + lost)"
                  to={{ section: "reports" }}
                />
                <KpiCard
                  label="Forecast revenue"
                  value={formatCrmMinor(kpis.data.forecastRevenueMinor, currency)}
                  hint="Weighted deals expected to close in range"
                  to={{ section: "forecasting" }}
                />
                <KpiCard
                  label="Stagnant deals"
                  value={kpis.data.stagnantDeals}
                  hint="Open deals past stale threshold"
                  to={{ section: "opportunities" }}
                />
                <KpiCard
                  label="Overdue follow-ups"
                  value={kpis.data.overdueFollowUps}
                  hint="Open activities past due"
                  to={{ section: "tasks" }}
                />
                <KpiCard
                  label="Upcoming meetings"
                  value={kpis.data.upcomingMeetings}
                  hint="Next 7 days"
                  to={{ section: "calendar" }}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </ListWorkspace>
  );
}
