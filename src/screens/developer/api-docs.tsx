import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import { listPublicApiCatalog } from "@/lib/app-store/api/v1/router";
import { listPublicApiScopes } from "@/lib/app-store/app-store.functions";
import { PUBLIC_API_VERSION } from "@/lib/app-store/public-api-scopes";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function DeveloperApiDocsPage() {
  const { can } = useCan();
  const canOpen =
    can("developer.manage_apps" as Permission) ||
    can("developer.submit_apps" as Permission) ||
    can("appstore.view" as Permission);
  const fetchScopes = useServerFn(listPublicApiScopes);
  const scopes = useQuery({
    queryKey: ["public-api-scopes"],
    queryFn: () => fetchScopes(),
    enabled: canOpen,
    retry: false,
  });

  if (!canOpen) {
    return (
      <>
        <ListWorkspace title="API Documentation" description="Developer portal">
        <EmptyState title="No access" description="Requires developer or App Store view access." />
    </ListWorkspace>
      </>
    );
  }

  return (
    <>
      <ListWorkspace
        title="API Documentation"
        description={`LinkBooks public API ${PUBLIC_API_VERSION} — scoped, versioned access for approved partners.`}
        subnav={<DeveloperSubnav current="api-docs" />}
      >
      <Alert className="mb-6">
        <AlertTitle>Security model</AlertTitle>
        <AlertDescription>
          Partners authenticate with OAuth 2.0 / PKCE where applicable, request least-privilege
          scopes, and never receive unrestricted database or service-role credentials. Runtime API
          routes and token issuance continue after this catalogue foundation.
        </AlertDescription>
      </Alert>

      {scopes.isLoading ? <LoadingState /> : null}
      {scopes.isError ? (
        <ErrorState
          title="Could not load scopes"
          description={friendlyAuthError(scopes.error)}
          onRetry={() => scopes.refetch()}
        />
      ) : null}

      {scopes.data ? (
        <div className="space-y-8">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopes.data.scopes.map((scope) => (
                  <TableRow key={scope.key}>
                    <TableCell className="font-mono text-xs">{scope.key}</TableCell>
                    <TableCell>{scope.module}</TableCell>
                    <TableCell>
                      <Badge variant={scope.access === "write" ? "default" : "secondary"}>
                        {scope.access}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{scope.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Versioned routes ({PUBLIC_API_VERSION})</h2>
            <p className="text-sm text-muted-foreground">
              Documented partner surface. Runtime calls stay gated until OAuth token issuance and
              the credential vault are production-ready. Status “documented” is not “implemented”.
            </p>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listPublicApiCatalog().routes.map((route) => (
                    <TableRow key={`${route.method}-${route.path}`}>
                      <TableCell className="font-mono text-xs">{route.method}</TableCell>
                      <TableCell className="font-mono text-xs">{route.path}</TableCell>
                      <TableCell className="font-mono text-xs">{route.scope}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{route.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      ) : null}
      </ListWorkspace>
    </>
  );
}
