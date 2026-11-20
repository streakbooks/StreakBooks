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

import { getCrmSettings, listCrmDealInvoices } from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";

export function CrmRelationshipsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canSales = can("sales.view" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchDeals = useServerFn(listCrmDealInvoices);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const deals = useQuery({
    queryKey: ["crm-deal-invoices", company?.id],
    queryFn: () => fetchDeals({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && canSales && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title="Customer Relationships"
        description="Read-only Sales payment status for CRM deals."
      >
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const rows = deals.data ?? [];

  return (
    <ListWorkspace
      title="Customer Relationships"
      description="Read-only invoice and payment status for opportunities with a linked Sales quote. CRM never posts journals."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Customer Relationships" }]}
      actions={
        <Button asChild variant="secondary">
          <Link to="/sales/invoices">Open Sales invoices</Link>
        </Button>
      }
      subnav={<CrmSubnav current="relationships" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : null}
      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM before reviewing deal payments."
        />
      ) : null}

      {settings.isSuccess && settings.data?.enabled && !canSales ? (
        <EmptyState
          title="Sales view required"
          description="Payment status is gated by sales.view so CRM cannot leak AR without Sales permission."
        />
      ) : null}

      {settings.isSuccess && settings.data?.enabled && canSales ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Accounting boundary</AlertTitle>
            <AlertDescription>
              Outstanding balances come from Sales invoice fields only. Forecast pipeline values
              stay on Opportunities and are not GL revenue.
            </AlertDescription>
          </Alert>

          {deals.isLoading ? <LoadingState /> : null}
          {deals.isError ? (
            <QueryErrorState queries={[deals]} title="Could not load deal invoices" />
          ) : null}
          {deals.isSuccess && rows.length === 0 ? (
            <EmptyState
              title="No linked quotes yet"
              description="Create a Sales quote from an opportunity on Quotes & Proposals first."
              action={
                <Button asChild size="sm">
                  <Link to="/crm/$section" params={{ section: "quotes" }}>
                    Open Quotes & Proposals
                  </Link>
                </Button>
              }
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Opportunity</TableHead>
                    <TableHead>Quote</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.opportunityId}>
                      <TableCell>
                        <div className="font-medium">{row.opportunityNumber}</div>
                        <div className="text-sm text-muted-foreground">{row.opportunityName}</div>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/sales/quotes/$quoteId"
                          params={{ quoteId: row.quoteId }}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {row.quoteNumber ?? "Open quote"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {row.invoiceId ? (
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: row.invoiceId }}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {row.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Not invoiced</span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">
                        {row.invoiceStatus ?? "—"}
                        {row.isOverdue ? (
                          <span className="ml-2 text-xs text-destructive">Overdue</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.invoiceId
                          ? formatCrmMinor(row.outstandingMinor, row.currencyCode)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
