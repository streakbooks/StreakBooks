import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";

import { getHrDashboardKpis, getHrSettings } from "@/lib/hr/hr.functions";
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
  to?: "employees" | "organization" | "approvals" | "documents" | "attendance" | "offboarding";
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
      to="/hr/$section"
      params={{ section: to }}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

export function HrOverviewPage() {
  const { company, isPending } = useActiveCompany();
  const { can, role } = useCan();
  const canOpen = can("hr.view" as Permission);
  const fetchSettings = useServerFn(getHrSettings);
  const fetchKpis = useServerFn(getHrDashboardKpis);

  const settings = useQuery({
    queryKey: ["hr-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  const kpis = useQuery({
    queryKey: ["hr-dashboard-kpis", company?.id],
    queryFn: () => fetchKpis({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace
        title="HR Dashboard"
        description="Workforce and employee lifecycle."
        subnav={<HrSubnav current="overview" />}
      >
        <EmptyState
          title="No HR access"
          description={`Missing permission: hr.view (active role: ${role ?? "unknown"}). Ask an owner or administrator to grant HR access, then refresh the page.`}
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="HR Dashboard"
      description="Workforce position across the shared employee identity used by Payroll."
      breadcrumbs={[{ label: "HR" }]}
      subnav={<HrSubnav current="overview" />}
      actions={
        can("hr.settings.edit" as Permission) ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/hr/$section" params={{ section: "settings" }}>
              HR settings
            </Link>
          </Button>
        ) : undefined
      }
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load HR settings" />
      ) : null}

      {settings.data && !settings.data.enabled ? (
        <Alert className="mb-4">
          <AlertTitle>HR is not enabled</AlertTitle>
          <AlertDescription>
            Enable HR in settings before relying on organisation and profile workflows. Employee pay
            records remain available in Payroll.
            {can("hr.settings.edit" as Permission) ? (
              <>
                {" "}
                <Link to="/hr/$section" params={{ section: "settings" }} className="underline">
                  Open HR settings
                </Link>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {settings.data?.disclaimer ? (
        <Alert className="mb-4">
          <AlertTitle>Compliance notice</AlertTitle>
          <AlertDescription>{settings.data.disclaimer}</AlertDescription>
        </Alert>
      ) : null}

      {kpis.isPending ? (
        <LoadingState />
      ) : kpis.isError ? (
        <QueryErrorState queries={[kpis]} title="Could not load HR overview" />
      ) : kpis.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Active employees"
            value={kpis.data.activeEmployees}
            hint="From shared payroll_employees identity"
            to="employees"
          />
          <KpiCard
            label="HR profiles linked"
            value={kpis.data.profilesLinked}
            hint="Employees with HR organisation facts"
            to="employees"
          />
          <KpiCard
            label="Departments"
            value={kpis.data.departments}
            hint="Active departments"
            to="organization"
          />
          <KpiCard
            label="Locations"
            value={kpis.data.locations}
            hint="Active work locations"
            to="organization"
          />
          <KpiCard
            label="Pending approvals"
            value={kpis.data.pendingApprovals}
            hint="Wired in HR-07"
            to="approvals"
          />
          <KpiCard
            label="Attendance exceptions"
            value={kpis.data.attendanceExceptions}
            hint="Wired in HR-05"
            to="attendance"
          />
          <KpiCard
            label="Expiring documents"
            value={kpis.data.expiringDocuments}
            hint="Wired in HR-08"
            to="documents"
          />
          <KpiCard
            label="Payroll handoffs"
            value={kpis.data.payrollHandoffsPending}
            hint="Approved compensation + ready offboarding"
            to="offboarding"
          />
          <KpiCard
            label="Terminated"
            value={kpis.data.terminatedEmployees}
            hint="Employment status from shared identity"
            to="employees"
          />
        </div>
      ) : (
        <EmptyState
          title="No KPI data"
          description="Enable HR and ensure the foundation migration is applied."
        />
      )}
    </ListWorkspace>
  );
}
