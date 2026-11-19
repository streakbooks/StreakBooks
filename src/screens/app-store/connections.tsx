import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
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
  listCompanyIntegrationConnections,
  revokeMarketplaceAppAccess,
} from "@/lib/app-store/app-store.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function AppStoreConnectionsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.view" as Permission) || can("appstore.manage_connections" as Permission);
  const canRevoke = can("appstore.manage_connections" as Permission);
  const queryClient = useQueryClient();
  const fetchConnections = useServerFn(listCompanyIntegrationConnections);
  const revokeAccess = useServerFn(revokeMarketplaceAppAccess);
  const connections = useQuery({
    queryKey: ["app-store-connections", company?.id],
    queryFn: () => fetchConnections({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const revokeMutation = useMutation({
    mutationFn: (appCode: string) =>
      revokeAccess({
        data: { companyId: company!.id, appCode, reason: "customer_revoked" },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["app-store-connections", company?.id] });
      void queryClient.invalidateQueries({ queryKey: ["app-store-consents", company?.id] });
      toast.success(`Access revoked for ${result.appCode}`);
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error));
    },
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Connections" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view or manage_connections." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Connections"
      description="Central connection workspace. Access and refresh tokens are never displayed."
      subnav={<AppStoreSubnav current="connections" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Connection lifecycle (AS-02 / AS-SEC)</AlertTitle>
        <AlertDescription>
          Schema and list RPCs are in place. OAuth authorization, reauthorize, pause/resume and
          disconnect complete when at least one native connector passes E2E verification and
          security gates. Tokens are never displayed. Use Privacy &amp; Access for consent history.
          Until then this list stays empty rather than inventing connected accounts.
        </AlertDescription>
      </Alert>

      {connections.isLoading ? <LoadingState /> : null}
      {connections.isError ? (
        <QueryErrorState queries={[connections]} title="Could not load connections" />
      ) : null}

      {!connections.isLoading && !connections.isError ? (
        (connections.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No connections yet"
            description="No provider connections exist for this organisation. Native Amazon, Shopify and Stripe installs unlock after verified E2E sync."
            action={
              <Button asChild>
                <Link to="/app-store/$section" params={{ section: "explore" }}>
                  Browse apps
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
                  <TableHead>Provider</TableHead>
                  <TableHead>External account</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        to="/app-store/apps/$appCode"
                        params={{ appCode: row.appCode }}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.appCode}
                      </Link>
                    </TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell>
                      {row.externalAccountLabel ?? row.externalAccountId ?? "—"}
                    </TableCell>
                    <TableCell>{row.authMethod}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.health} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.lastSuccessfulSyncAt ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRevoke && row.status !== "disconnected" ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              aria-label={`Revoke ${row.appCode} access for this organisation`}
                              disabled={revokeMutation.isPending}
                            >
                              Disconnect
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke {row.appCode} access?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This revokes {row.appCode} access for the entire current
                                organisation, including every linked account for this app. It is not
                                limited to the account shown in this row. Existing accounting
                                records are not deleted. Reconnecting requires new authorisation.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={revokeMutation.isPending}>
                                Keep connected
                              </AlertDialogCancel>
                              <AlertDialogAction
                                disabled={revokeMutation.isPending}
                                onClick={() => revokeMutation.mutate(row.appCode)}
                              >
                                Revoke app access
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
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
