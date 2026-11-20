import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";

import { getCrmForecastReport, getCrmSettings } from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";

export function CrmForecastingPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("crm.view" as Permission) ||
    can("crm.reports.view" as Permission) ||
    can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchForecast = useServerFn(getCrmForecastReport);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const forecast = useQuery({
    queryKey: ["crm-forecast-report", company?.id],
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
      <ListWorkspace title="Sales Forecasting" description="Weighted pipeline by stage.">
        <EmptyState
          title="No CRM access"
          description="Ask an administrator for crm.view or crm.reports.view."
        />
      </ListWorkspace>
    );
  }

  const currency = company.base_currency || "USD";
  const report = forecast.data;

  return (
    <ListWorkspace
      title="Sales Forecasting"
      description="Weighted open-pipeline expectation by stage. Not posted GL revenue."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Sales Forecasting" }]}
      actions={
        <Button asChild variant="secondary">
          <Link to="/crm/$section" params={{ section: "opportunities" }}>
            Open opportunities
          </Link>
        </Button>
      }
      subnav={<CrmSubnav current="forecasting" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : null}
      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM before reviewing forecasts." />
      ) : null}

      {settings.isSuccess && settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Forecast boundary</AlertTitle>
            <AlertDescription>
              {report?.note ??
                "Weighted pipeline is a CRM forecast expectation. It is not posted accounting revenue."}
            </AlertDescription>
          </Alert>

          {forecast.isLoading ? <LoadingState /> : null}
          {forecast.isError ? (
            <QueryErrorState queries={[forecast]} title="Could not load forecast" />
          ) : null}

          {forecast.isSuccess && report ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Open deals</CardDescription>
                    <CardTitle className="text-3xl tabular-nums">{report.openDealCount}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Pipeline value</CardDescription>
                    <CardTitle className="text-3xl tabular-nums">
                      {formatCrmMinor(report.pipelineValueMinor, currency)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Weighted forecast</CardDescription>
                    <CardTitle className="text-3xl tabular-nums">
                      {formatCrmMinor(report.weightedPipelineValueMinor, currency)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {report.stages.length === 0 ? (
                <EmptyState
                  title="No stages"
                  description="Create a pipeline with stages first."
                  action={
                    <Button asChild size="sm">
                      <Link to="/crm/$section" params={{ section: "pipelines" }}>
                        Open pipelines
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right">Deals</TableHead>
                        <TableHead className="text-right">Probability</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Weighted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.stages.map((stage) => (
                        <TableRow key={stage.stageId}>
                          <TableCell className="font-medium">{stage.stageName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {stage.dealCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {stage.probabilityPct}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCrmMinor(stage.amountMinor, currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCrmMinor(stage.weightedMinor, currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
