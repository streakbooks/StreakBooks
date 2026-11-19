import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCan } from "@/hooks/use-can";
import { listPublicApiScopes } from "@/lib/app-store/app-store.functions";
import { PUBLIC_API_VERSION } from "@/lib/app-store/public-api-scopes";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function DeveloperDashboardPage() {
  const { can } = useCan();
  const canOpen =
    can("developer.manage_apps" as Permission) || can("developer.submit_apps" as Permission);
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
        <ListWorkspace
          title="Developer portal"
          description="Build partner integrations on the LinkBooks public API."
        >
          <EmptyState
            title="No developer access"
            description="Ask an owner or admin for developer.manage_apps or developer.submit_apps."
          />
        </ListWorkspace>
      </>
    );
  }

  return (
    <>
      <ListWorkspace
        title="Developer portal"
        description="Secure public API, OAuth clients and partner publishing for Hubdoc, Link My Books and other approved providers."
        actions={
          <Button asChild size="sm">
            <Link to="/developer/$section" params={{ section: "api-docs" }}>
              API documentation
            </Link>
          </Button>
        }
        subnav={<DeveloperSubnav current="dashboard" />}
      >
        <Alert className="mb-6">
          <AlertTitle>Open platform foundation ({PUBLIC_API_VERSION})</AlertTitle>
          <AlertDescription>
            Third-party providers integrate through scoped OAuth and the public API — never with
            service-role database credentials. Publisher registration, credential issuance and
            marketplace submission workflows continue in AS-05. Native Amazon, Shopify and Stripe
            connectors remain first-party and are not complete until E2E sync is verified.
          </AlertDescription>
        </Alert>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card className="transition-colors hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription>Published API scopes</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {scopes.data?.scopes.length ?? "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/developer/$section" params={{ section: "api-docs" }}>
                  View scopes
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription>Credentials</CardDescription>
              <CardTitle className="text-base">Vault locked</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/developer/$section" params={{ section: "credentials" }}>
                  Open credentials
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription>OAuth / PKCE</CardDescription>
              <CardTitle className="text-base">Fail closed</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/developer/$section" params={{ section: "oauth" }}>
                  Configure OAuth
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {scopes.isLoading ? <LoadingState /> : null}
        {scopes.isError ? (
          <QueryErrorState queries={[scopes]} title="Could not load API scopes" />
        ) : null}

        {scopes.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Partner integration path</CardTitle>
              <CardDescription>
                Source: {scopes.data.ready ? "database" : "defaults"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Create a verified publisher profile.</li>
                <li>Register an application with redirect URIs and least-privilege scopes.</li>
                <li>Issue OAuth credentials (secret shown once; stored hashed).</li>
                <li>Test against sandbox organisations.</li>
                <li>Submit for marketplace review — publishers cannot self-approve.</li>
              </ol>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/developer/$section" params={{ section: "register" }}>
                    Register application
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/app-store">Open App Store</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </ListWorkspace>
    </>
  );
}
