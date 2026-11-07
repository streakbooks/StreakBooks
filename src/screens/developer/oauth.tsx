import { Link } from "@tanstack/react-router";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { EmptyState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCan } from "@/hooks/use-can";
import { listPublicApiCatalog } from "@/lib/app-store/api/v1/router";
import { PUBLIC_API_VERSION } from "@/lib/app-store/public-api-scopes";
import type { Permission } from "@/lib/permissions";

/** OAuth 2.0 / PKCE configuration — documented and gated until vault + review. */
export function DeveloperOAuthPage() {
  const { can } = useCan();
  const canManage = can("developer.manage_apps" as Permission);
  const catalog = listPublicApiCatalog();

  if (!canManage) {
    return (
      <>
        <PageHeader title="OAuth Configuration" description="Developer portal" />
        <EmptyState title="No access" description="Requires developer.manage_apps." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="OAuth Configuration"
        description={`Authorization Code + PKCE for LinkBooks Public API ${PUBLIC_API_VERSION}.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/developer/$section" params={{ section: "credentials" }}>
              API credentials
            </Link>
          </Button>
        }
      />
      <DeveloperSubnav current="oauth" />

      <Alert className="mb-6">
        <AlertTitle>Production token issuance locked</AlertTitle>
        <AlertDescription>
          {catalog.auth.note} Redirect URIs must be HTTPS (or localhost). State and PKCE challenges
          are validated server-side with replay protection. Cross-company state reuse is denied.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Grant type</CardDescription>
            <CardTitle className="text-base">Authorization Code</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge>PKCE S256 required</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Token storage</CardDescription>
            <CardTitle className="text-base">{catalog.auth.tokenStorage}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Never returned to browser UI.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Production ready</CardDescription>
            <CardTitle className="text-base">Fail closed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Requires vault, security review and active consent.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redirect URI rules</CardTitle>
          <CardDescription>
            Allowlisted exact matches only. Open redirects and http (non-localhost) are rejected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Example (not live): https://partner.example/oauth/callback</p>
          <p>Local development: http://localhost:8080/oauth/callback</p>
          <Button disabled className="mt-2" title="Vault not configured">
            Save redirect allowlist
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
