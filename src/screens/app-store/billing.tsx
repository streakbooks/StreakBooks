import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreBillingPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="App Billing" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view." />
      </ListWorkspace>
    );
  }

  const apps = catalogue.data?.apps ?? [];

  return (
    <ListWorkspace
      title="App Billing"
      description="Marketplace pricing models for catalogue apps. Separate from LinkBooks SaaS and Advisors billing. No charges are collected here."
      subnav={<AppStoreSubnav current="billing" />}
    >
      <Alert className="mb-6">
        <AlertTitle>No marketplace charges without authorization</AlertTitle>
        <AlertDescription>
          This workspace shows declared pricing models only (free, freemium, subscription, usage,
          external billed). It does not create invoices, capture cards or activate paid plans.
        </AlertDescription>
      </Alert>

      {catalogue.isLoading ? <LoadingState /> : null}
      {catalogue.isError ? (
        <ErrorState
          title="Could not load billing catalogue"
          description={friendlyAuthError(catalogue.error)}
          onRetry={() => catalogue.refetch()}
        />
      ) : null}

      {!catalogue.isLoading && !catalogue.isError ? (
        apps.length === 0 ? (
          <EmptyState
            title="No marketplace apps"
            description="Catalogue is empty."
            action={
              <Button asChild size="sm">
                <Link to="/app-store/$section" params={{ section: "explore" }}>
                  Explore apps
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Pricing model</TableHead>
                  <TableHead>Install status</TableHead>
                  <TableHead>Charge status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.code}>
                    <TableCell>{app.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{app.pricingModel.replaceAll("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{app.installStatus ?? "not_installed"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {app.pricingModel === "free" || app.pricingModel === "external_billed"
                        ? "No LinkBooks marketplace charge"
                        : "Not activated — no charge"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </ListWorkspace>
  );
}
