import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getHrDashboardKpis } from "@/lib/hr/hr.functions";

function InsightCard({
  label,
  value,
  hint,
  section,
}: {
  label: string;
  value: string | number;
  hint: string;
  section?:
    | "employees"
    | "organization"
    | "approvals"
    | "documents"
    | "attendance"
    | "offboarding"
    | "reports";
}) {
  const body = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums sm:text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
  if (!section) return body;
  return (
    <Link
      to="/hr/$section"
      params={{ section }}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

/** Workforce Insights — KPI drill-in surface under Overview (real dashboard KPIs, no dummy metrics). */
export function HrWorkforceInsightsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canReports = useCanDo("hr.reports.view");
  const fetchKpis = useServerFn(getHrDashboardKpis);

  const kpis = useQuery({
    queryKey: ["hr-dashboard-kpis", company?.id, "workforce-insights"],
    queryFn: () => fetchKpis({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && (canView || canReports),
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView && !canReports) {
    return (
      <ListWorkspace
        title="Workforce Insights"
        description="Headcount and lifecycle signals for the shared employee identity."
        subnav={<HrSubnav current="workforce-insights" />}
      >
        <EmptyState
          title="No HR access"
          description="Ask an administrator for hr.view or hr.reports.view."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Workforce Insights"
      description="Live headcount, exceptions, and handoff signals. Open HR Reports for formal exports."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Workforce Insights" }]}
      subnav={<HrSubnav current="workforce-insights" />}
      actions={
        canReports || canView ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/hr/$section" params={{ section: "reports" }}>
              HR Reports
            </Link>
          </Button>
        ) : undefined
      }
    >
      {kpis.isPending ? (
        <LoadingState />
      ) : kpis.isError ? (
        <ErrorState
          title="Could not load workforce insights"
          description={friendlyAuthError(kpis.error)}
          onRetry={() => kpis.refetch()}
        />
      ) : kpis.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <InsightCard
            label="Active employees"
            value={kpis.data.activeEmployees}
            hint="Shared payroll_employees identity"
            section="employees"
          />
          <InsightCard
            label="HR profiles linked"
            value={kpis.data.profilesLinked}
            hint="Organisation facts on file"
            section="employees"
          />
          <InsightCard
            label="Pending approvals"
            value={kpis.data.pendingApprovals}
            hint="Approvals queue"
            section="approvals"
          />
          <InsightCard
            label="Attendance exceptions"
            value={kpis.data.attendanceExceptions}
            hint="Needs review"
            section="attendance"
          />
          <InsightCard
            label="Expiring documents"
            value={kpis.data.expiringDocuments}
            hint="Document compliance"
            section="documents"
          />
          <InsightCard
            label="Payroll handoffs"
            value={kpis.data.payrollHandoffsPending}
            hint="Compensation / offboarding ready"
            section="offboarding"
          />
          <InsightCard
            label="Departments"
            value={kpis.data.departments}
            hint="Active departments"
            section="organization"
          />
          <InsightCard
            label="Locations"
            value={kpis.data.locations}
            hint="Active work locations"
            section="organization"
          />
          <InsightCard
            label="Terminated"
            value={kpis.data.terminatedEmployees}
            hint="Employment status"
            section="employees"
          />
        </div>
      ) : (
        <EmptyState
          title="No insight data"
          description="Enable HR and ensure the foundation migration is applied."
        />
      )}
    </ListWorkspace>
  );
}
