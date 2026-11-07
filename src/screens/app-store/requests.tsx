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
import {
  listCompanyAppInstallRequests,
  listCompanyMarketplaceApps,
} from "@/lib/app-store/app-store.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreRequestsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.view" as Permission) ||
    can("appstore.request_install" as Permission) ||
    can("appstore.install" as Permission);
  const fetchRequests = useServerFn(listCompanyAppInstallRequests);
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);

  const requests = useQuery({
    queryKey: ["app-store-requests", company?.id],
    queryFn: () => fetchRequests({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
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
      <ListWorkspace title="App Requests" description="App Store"
    >
      <EmptyState
          title="No access"
          description="Requires App Store request or view permission."
        />
    </ListWorkspace>
    );
  }

  const installationRequests = (catalogue.data?.apps ?? []).filter(
    (app) => app.installStatus === "installed" || app.installId,
  );

  return (
      <ListWorkspace title="App Requests"
        description="Installation requests and approvals. Approval never bypasses connector authorization."
      subnav={<AppStoreSubnav current="requests"/>}
    >
      <Alert className="mb-6">
        <AlertTitle>Requests foundation</AlertTitle>
        <AlertDescription>
          Formal approval workflow tables are ready. Until a connector is E2E verified, Explore
          records installation requests on app_installations rather than claiming a live connection.
        </AlertDescription>
      </Alert>

      {requests.isLoading || catalogue.isLoading ? <LoadingState /> : null}
      {requests.isError ? (
        <ErrorState
          title="Could not load requests"
          description={friendlyAuthError(requests.error)}
          onRetry={() => requests.refetch()}
        />
      ) : null}

      {!requests.isLoading && !catalogue.isLoading && !requests.isError ? (
        <>
          <section className="mb-8 space-y-3">
            <h2 className="text-lg font-semibold">Catalogue requests / installs</h2>
            {installationRequests.length === 0 ? (
              <EmptyState
                title="No installation requests"
                description="Request an app from its detail page."
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
                      <TableHead>Status</TableHead>
                      <TableHead>Connector</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installationRequests.map((app) => (
                      <TableRow key={app.code}>
                        <TableCell className="font-medium">{app.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{app.installStatus}</Badge>
                        </TableCell>
                        <TableCell>{app.implementationStatus}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/app-store/apps/$appCode" params={{ appCode: app.code }}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Formal approval queue</h2>
            {(requests.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No formal approval records"
                description="AS-02 approval transitions will populate this queue."
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>App</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Justification</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.data?.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.appCode}</TableCell>
                        <TableCell>
                          <Badge>{row.status}</Badge>
                        </TableCell>
                        <TableCell className="max-w-sm truncate text-muted-foreground">
                          {row.justification || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.createdAt || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </ListWorkspace>
  );
}
