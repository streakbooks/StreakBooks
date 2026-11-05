import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Settings2 } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PayrollOverviewPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canEdit = useCanDo("payroll.settings.edit");
  const fetchPage = useServerFn(getPayrollSettingsPage);
  const page = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchPage({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader
          title="Payroll"
          description="Basic Global Payroll for international businesses."
        />
        <EmptyState
          title="No payroll access"
          description="Ask an organisation administrator for the payroll.view permission."
        />
      </>
    );
  }
  if (page.isPending) return <LoadingState />;
  if (page.isError) {
    return (
      <ErrorState
        title="Could not load payroll"
        description={friendlyAuthError(page.error)}
        onRetry={() => page.refetch()}
      />
    );
  }

  const data = page.data;
  const enabled = Boolean(data.settings?.enabled);

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Basic Global Payroll with manually managed statutory deductions."
        actions={
          canEdit ? (
            <Button asChild size="sm">
              <Link to="/payroll/settings">
                <Settings2 className="mr-2 h-4 w-4" />
                Payroll settings
              </Link>
            </Button>
          ) : null
        }
      />
      <PayrollSubnav current="overview" />

      {!data.available ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{data.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Module status</CardTitle>
              <CardDescription>
                {enabled
                  ? "Basic Payroll is enabled for this organisation."
                  : "Basic Payroll is configured but not enabled."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {enabled ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                )}
                <span>{enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-muted-foreground">Operating country</dt>
                  <dd className="font-medium">
                    {data.settings?.operating_country_code ?? data.company.country_code}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payroll currency</dt>
                  <dd className="font-medium">
                    {data.settings?.payroll_currency ?? data.company.base_currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pay schedules</dt>
                  <dd className="font-medium">
                    {data.schedules.filter((s) => s.is_active).length}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pay components</dt>
                  <dd className="font-medium">
                    {data.components.filter((c) => c.is_active).length}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compliance notice</CardTitle>
              <CardDescription>Applies to every Basic Payroll organisation.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{data.disclaimer}</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">What is available now</CardTitle>
              <CardDescription>
                Batch 1 delivers payroll foundation, security and settings. Employees, runs,
                payslips, payments and reports follow in later batches.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/payroll/settings">Configure payroll settings</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings" search={{ section: "features" }}>
                  Feature Manager
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
