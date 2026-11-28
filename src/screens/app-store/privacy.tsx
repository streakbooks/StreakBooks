import { useState } from "react";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  grantAppConnectionConsent,
  listCompanyAppConsents,
  listCompanyMarketplaceSecurityAlerts,
  revokeMarketplaceAppAccess,
  type AppConsentRow,
  type MarketplaceSecurityAlertRow,
} from "@/lib/app-store/app-store.functions";
import { PUBLIC_API_SCOPES } from "@/lib/app-store/public-api-scopes";
import { decideConsentGrant } from "@/lib/app-store/security/consent";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function AppStorePrivacyPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.view" as Permission) || can("appstore.manage_connections" as Permission);
  const canManage = can("appstore.manage_connections" as Permission);
  const queryClient = useQueryClient();
  const fetchConsents = useServerFn(listCompanyAppConsents);
  const fetchAlerts = useServerFn(listCompanyMarketplaceSecurityAlerts);
  const revokeAccess = useServerFn(revokeMarketplaceAppAccess);
  const grantConsent = useServerFn(grantAppConnectionConsent);
  const [grantAppCode, setGrantAppCode] = useState("");
  const [grantScopes, setGrantScopes] = useState("organisation.read");

  const consents = useQuery<AppConsentRow[]>({
    queryKey: ["app-store-consents", company?.id],
    queryFn: () => fetchConsents({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const alerts = useQuery<MarketplaceSecurityAlertRow[]>({
    queryKey: ["app-store-security-alerts", company?.id],
    queryFn: () => fetchAlerts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const revokeMutation = useMutation({
    mutationFn: (appCode: string) =>
      revokeAccess({
        data: { companyId: company!.id, appCode, reason: "customer_revoked" },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["app-store-consents", company?.id] });
      void queryClient.invalidateQueries({ queryKey: ["app-store-connections", company?.id] });
      void queryClient.invalidateQueries({
        queryKey: ["app-store-security-alerts", company?.id],
      });
      toast.success(`Access revoked for ${result.appCode}`);
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error));
    },
  });

  const grantMutation = useMutation({
    mutationFn: () => {
      const requested = grantScopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed = PUBLIC_API_SCOPES.map((s) => s.key);
      const decision = decideConsentGrant({
        companyId: company!.id,
        appCode: grantAppCode.trim(),
        connectionId: null,
        requestedScopes: requested,
        allowedScopes: allowed,
      });
      if (!decision.ok) {
        throw new Error(
          decision.reason === "scope_escalation"
            ? `Scope escalation denied: ${(decision.deniedScopes ?? []).join(", ")}`
            : "Consent could not be granted.",
        );
      }
      return grantConsent({
        data: {
          companyId: company!.id,
          appCode: grantAppCode.trim(),
          connectionId: null,
          grantedScopes: decision.grantedScopes,
          consentVersion: decision.consentVersion,
        },
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["app-store-consents", company?.id] });
      setGrantAppCode("");
      toast.success(`Consent recorded for ${result.appCode}`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Privacy & access" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view or manage_connections." />
      </ListWorkspace>
    );
  }

  const activeConsents = (consents.data ?? []).filter((c) => c.status === "active");

  return (
    <ListWorkspace
      title="Privacy & access"
      description="Granular consent, permission visibility, connection history and revocation for marketplace apps."
      subnav={<AppStoreSubnav current="privacy" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Zero-trust customer controls</AlertTitle>
        <AlertDescription>
          Tokens and credentials are never shown here. Revoking access disconnects the application,
          clears credential references and records an audit event. Real customer data stays locked
          until security gates pass (fail closed).
        </AlertDescription>
      </Alert>

      {canManage ? (
        <div className="mb-8 space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Record consent</h2>
          <p className="text-sm text-muted-foreground">
            Manual consent capture for authorised scopes. Scope escalation outside the published
            public API catalogue is blocked client-side and server-side.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="consent-app">App code</Label>
              <Input
                id="consent-app"
                value={grantAppCode}
                onChange={(e) => setGrantAppCode(e.target.value)}
                placeholder="shopify"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consent-scopes">Scopes (comma-separated)</Label>
              <Input
                id="consent-scopes"
                value={grantScopes}
                onChange={(e) => setGrantScopes(e.target.value)}
                placeholder="organisation.read, contacts.read"
                autoComplete="off"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={grantMutation.isPending || !grantAppCode.trim()}
            onClick={() => grantMutation.mutate()}
          >
            Grant consent
          </Button>
        </div>
      ) : null}

      <div className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Active consents</h2>
        {consents.isPending || consents.isLoading ? (
          <LoadingState />
        ) : consents.isError ? (
          <QueryErrorState queries={[consents]} title="Could not load consents" />
        ) : consents.isSuccess ? (
          activeConsents.length === 0 ? (
            <EmptyState
              title="No active consents"
              description="When an integration is authorized, granted scopes appear here for review and revocation."
              action={
                <Button asChild>
                  <Link to="/app-store/$section" params={{ section: "connections" }}>
                    View connections
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
                    <TableHead>Granted scopes</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Consented</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeConsents.map((row) => (
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
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.grantedScopes.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            row.grantedScopes.map((scope) => (
                              <Badge key={scope} variant="outline">
                                {scope}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{row.consentVersion}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.consentedAt || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(row.appCode)}
                          >
                            Revoke access
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">View only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Security alerts</h2>
        {alerts.isPending || alerts.isLoading ? (
          <LoadingState />
        ) : alerts.isError ? (
          <QueryErrorState queries={[alerts]} title="Could not load alerts" />
        ) : alerts.isSuccess ? (
          (alerts.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No security alerts"
              description="Rate-limit, permission-denied and cross-tenant attempts for this organisation appear here."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.data?.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge
                          variant={
                            row.severity === "critical" || row.severity === "high"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {row.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.alertType}</TableCell>
                      <TableCell>{row.appCode ?? "—"}</TableCell>
                      <TableCell>{row.message}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.createdAt || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </div>
    </ListWorkspace>
  );
}
