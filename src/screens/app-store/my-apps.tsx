import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
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
import { connectorStatusLabel } from "@/lib/app-store/connector-status";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreMyAppsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.view" as Permission) ||
    can("appstore.install" as Permission) ||
    can("appstore.manage_connections" as Permission);
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
      <ListWorkspace title="My Apps" description="App Store">
        <EmptyState
          title="No access"
          description="Requires App Store view or install permission."
        />
      </ListWorkspace>
    );
  }
  if (catalogue.isLoading) {
    return (
      <ListWorkspace
        title="My Apps"
        description="Installed and requested applications."
        subnav={<AppStoreSubnav current="my-apps" />}
      >
        <LoadingState />
      </ListWorkspace>
    );
  }
  if (catalogue.isError) {
    return (
      <ErrorState
        title="Could not load My Apps"
        description={friendlyAuthError(catalogue.error)}
        onRetry={() => catalogue.refetch()}
      />
    );
  }

  const rows = (catalogue.data?.apps ?? []).filter(
    (app) => app.installStatus && app.installStatus !== "not_installed",
  );

  return (
    <ListWorkspace
      title="My Apps"
      description="Organisation installations and requests. Live connection and sync actions arrive after verified E2E connectors."
      actions={
        <Button asChild size="sm">
          <Link to="/app-store/$section" params={{ section: "explore" }}>
            Browse apps
          </Link>
        </Button>
      }
      subnav={<AppStoreSubnav current="my-apps" />}
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No apps installed yet"
          description="Request or install an application from Explore. Unverified connectors record a request only — they do not pretend to sync."
          action={
            <Button asChild>
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
                <TableHead>Publisher</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Connector status</TableHead>
                <TableHead>Install status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((app) => (
                <TableRow key={app.code}>
                  <TableCell className="font-medium">{app.name}</TableCell>
                  <TableCell>{app.publisherName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{app.kind}</Badge>
                  </TableCell>
                  <TableCell>{connectorStatusLabel(app.implementationStatus)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{app.installStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/app-store/apps/$appCode" params={{ appCode: app.code }}>
                        Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ListWorkspace>
  );
}
