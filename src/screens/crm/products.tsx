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

import { getCrmSettings } from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import { listProducts } from "@/lib/products/products.functions";
import type { Permission } from "@/lib/permissions";

export function CrmProductsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchProducts = useServerFn(listProducts);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const products = useQuery({
    queryKey: ["crm-products-bridge", company?.id],
    queryFn: () =>
      fetchProducts({
        data: { companyId: company!.id, status: "active", sort: "name", limit: 100 },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Products & Price Lists" description="Shared catalogue for CRM deals.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const rows = products.data ?? [];
  const currency = company.base_currency || "USD";

  return (
    <ListWorkspace
      title="Products & Price Lists"
      description="Read-only view of the shared Products & Services catalogue. CRM does not own a second product master."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Products & Price Lists" }]}
      actions={
        <Button asChild variant="secondary">
          <Link to="/products-services">Open Products & Services</Link>
        </Button>
      }
      subnav={<CrmSubnav current="products" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : null}
      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM before browsing catalogue lines."
        />
      ) : null}

      {settings.isSuccess && settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Shared catalogue</AlertTitle>
            <AlertDescription>
              Create and edit products in Products & Services. CRM opportunity quotes continue to
              use Sales document lines, not a CRM-only price list.
            </AlertDescription>
          </Alert>

          {products.isLoading ? <LoadingState /> : null}
          {products.isError ? (
            <QueryErrorState queries={[products]} title="Could not load products" />
          ) : null}
          {products.isSuccess && rows.length === 0 ? (
            <EmptyState
              title="No active products"
              description="Add catalogue items in Products & Services, then return here."
              action={
                <Button asChild>
                  <Link to="/products-services">Open Products & Services</Link>
                </Button>
              }
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Sales price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{row.code || "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        {row.description ? (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {row.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="capitalize">{row.kind}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCrmMinor(row.sales_price_minor ?? 0, currency)}
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
