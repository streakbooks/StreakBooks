import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Circle, Settings2 } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/utils";

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
      <ListWorkspace
        title="Payroll"
        description="Basic Global Payroll for international businesses."
      >
        <EmptyState
          title="No payroll access"
          description="Ask an organisation administrator for the payroll.view permission."
        />
      </ListWorkspace>
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
  const activeSchedules = data.schedules.filter((s) => s.is_active).length;
  const glMapped = Boolean(
    data.settings?.salary_expense_account_id &&
    data.settings?.net_pay_liability_account_id &&
    data.settings?.deduction_liability_account_id,
  );
  const setupSteps = [
    {
      label: "Acknowledge the compliance disclaimer and enable payroll in Settings",
      done: Boolean(data.settings?.disclaimer_acknowledged && data.settings?.enabled),
      href: "/payroll/settings" as const,
    },
    {
      label: "Add at least one active pay schedule",
      done: activeSchedules > 0,
      href: "/payroll/settings" as const,
    },
    {
      label: "Map salary expense and payroll liability GL accounts",
      done: glMapped,
      href: "/payroll/settings" as const,
    },
    {
      label: "Add active employees",
      done: (data.setupCounts?.activeEmployees ?? 0) > 0,
      href: "/payroll/employees" as const,
    },
    {
      label: "Assign current salary to at least one active employee",
      done: (data.setupCounts?.employeesWithCurrentSalary ?? 0) > 0,
      href: "/payroll/employees" as const,
    },
    {
      label: "Create and calculate a pay run",
      done: (data.setupCounts?.payrollRuns ?? 0) > 0,
      href: "/payroll/runs" as const,
    },
  ];
  const setupComplete = setupSteps.every((step) => step.done);
  const firstUndoneIndex = setupSteps.findIndex((step) => !step.done);
  const firstUndoneStep = firstUndoneIndex >= 0 ? setupSteps[firstUndoneIndex] : null;
  const showSetupChecklist = data.available && (!enabled || !setupComplete);

  return (
    <ListWorkspace
      title="Payroll"
      description="Basic Global Payroll with manually managed statutory deductions."
      actions={
        canEdit && enabled ? (
          <Button asChild size="sm">
            <Link to="/payroll/settings">
              <Settings2 className="mr-2 h-4 w-4" />
              Payroll settings
            </Link>
          </Button>
        ) : null
      }
      subnav={<PayrollSubnav current="overview" />}
    >
      {!data.available ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{data.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {showSetupChecklist ? (
            <Card className="lg:col-span-2 border-warning/30 bg-warning-soft/35">
              <CardHeader>
                <CardTitle className="text-base">Get payroll ready</CardTitle>
                <CardDescription>
                  Complete these steps before your first pay run. Statutory tax and filing stay
                  manual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-2 text-sm">
                  {setupSteps.map((step, index) => {
                    const isFirstUndone = !step.done && index === firstUndoneIndex;
                    return (
                      <li
                        key={step.label}
                        className={cn(
                          "flex items-start gap-2 rounded-md px-1 py-0.5",
                          isFirstUndone && "bg-warning-soft/75",
                        )}
                      >
                        {step.done ? (
                          <CheckCircle2
                            className="mt-0.5 h-4 w-4 shrink-0 text-success-ink"
                            aria-hidden
                          />
                        ) : (
                          <Circle
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
                              isFirstUndone ? "text-warning-ink" : "text-muted-foreground",
                            )}
                            aria-hidden
                          />
                        )}
                        {step.done ? (
                          <span className="text-muted-foreground">
                            <span className="font-medium tabular-nums">{index + 1}.</span>{" "}
                            {step.label}
                          </span>
                        ) : (
                          <Link
                            to={step.href}
                            className={cn(
                              "rounded-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              isFirstUndone && "font-semibold",
                            )}
                          >
                            <span className="font-medium tabular-nums">{index + 1}.</span>{" "}
                            {step.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {!enabled && canEdit ? (
                  <Button asChild>
                    <Link to="/payroll/settings">
                      <Settings2 className="mr-2 h-4 w-4" />
                      Open payroll settings
                    </Link>
                  </Button>
                ) : enabled && canEdit && !setupComplete && firstUndoneStep ? (
                  <Button asChild>
                    <Link to={firstUndoneStep.href}>Continue</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

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
                <StatusBadge
                  status={enabled ? "active" : "inactive"}
                  label={enabled ? "Enabled" : "Disabled"}
                />
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
              <CardTitle className="text-base">Live sections</CardTitle>
              <CardDescription>
                Open any area below to manage payroll. Statutory tax and filing remain manual.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Employees", "/payroll/employees", "Profiles, CSV import, payment and salary"],
                  ["Structures", "/payroll/salary-structures", "Reusable pay component templates"],
                  ["Runs", "/payroll/runs", "Calculate, review, approve, post"],
                  ["Payslips", "/payroll/payslips", "Issued snapshots after approval"],
                  ["Payments", "/payroll/payments", "Net-pay allocation and bank CSV export"],
                  ["Reports", "/payroll/reports", "Summary and expense views"],
                  ["Settings", "/payroll/settings", "Enable payroll, schedules, GL links"],
                ] as const
              ).map(([label, to, blurb]) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium text-foreground">{label}</span>
                  <p className="mt-1 text-muted-foreground">{blurb}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </ListWorkspace>
  );
}
