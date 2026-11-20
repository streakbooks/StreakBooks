import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { TrustBadges } from "@/components/app-store/TrustBadges";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { isInstallableNativeConnector } from "@/lib/app-store/adapters/registry";
import {
  listCompanyMarketplaceApps,
  requestMarketplaceAppInstall,
} from "@/lib/app-store/app-store.functions";
import { appCategoryByCode } from "@/lib/app-store/categories";
import {
  connectorInstallActionLabel,
  connectorStatusLabel,
  isConnectorE2EVerified,
} from "@/lib/app-store/connector-status";
import {
  canActivateMarketplaceApp,
  evaluateActivation,
  marketplaceAppActivationGates,
} from "@/lib/app-store/security/activation";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { AppStoreInstallWizard } from "@/screens/app-store/install-wizard";
import { toast } from "sonner";

export function AppStoreAppDetailPage({ appCode }: { appCode: string }) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
  const canInstall = can("appstore.install" as Permission);
  const canRequest = can("appstore.request_install" as Permission) || canInstall;
  const queryClient = useQueryClient();
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const requestInstall = useServerFn(requestMarketplaceAppInstall);

  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const installMutation = useMutation({
    mutationFn: () => requestInstall({ data: { companyId: company!.id, appCode } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["app-store-catalogue", company?.id] });
      if (result.status === "installed" && result.canActivate) {
        toast.success("App installed");
      } else {
        toast.success("Interest registered", {
          description:
            "Fail closed: live activation requires E2E verification, security review and real-data enablement. Your interest was recorded — no live customer-data connection was created.",
        });
      }
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
      <RecordWorkspace title="Application" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view." />
      </RecordWorkspace>
    );
  }
  if (catalogue.isLoading) {
    return (
      <RecordWorkspace title="Application" description="Loading listing…">
        <AppStoreSubnav current="explore" />
        <LoadingState />
      </RecordWorkspace>
    );
  }
  if (catalogue.isError) {
    return (
      <QueryErrorState queries={[catalogue]} title="Could not load application" />
    );
  }
  if (!catalogue.isSuccess) return null;
  const app = catalogue.data?.apps.find((a) => a.code === appCode);
  if (!app) {
    return (
      <RecordWorkspace title="Application not found" description="App Store">
        <AppStoreSubnav current="explore" />
        <EmptyState
          title="Listing not found"
          description="This app code is not in the published catalogue."
          action={
            <Button asChild>
              <Link to="/app-store/$section" params={{ section: "explore" }}>
                Back to explore
              </Link>
            </Button>
          }
        />
      </RecordWorkspace>
    );
  }

  const e2e = isConnectorE2EVerified(app.implementationStatus);
  const activation = evaluateActivation(marketplaceAppActivationGates(app, canInstall));
  const installable =
    e2e && isInstallableNativeConnector(app.code) && canActivateMarketplaceApp(app, canInstall);
  const action = connectorInstallActionLabel(app.implementationStatus);
  const already = app.installStatus === "installed" || app.installStatus === "disabled";

  return (
    <RecordWorkspace
      title={app.name}
      description={app.headline}
      insights={
        <WorkspaceInsights
          title="Related"
          facts={[
            {
              label: "Kind",
              value:
                app.kind === "native"
                  ? "Native"
                  : app.kind === "partner_api"
                    ? "Partner API"
                    : "Hybrid",
            },
            {
              label: "Status",
              value: connectorStatusLabel(app.implementationStatus),
            },
            {
              label: "Install state",
              value: app.installStatus?.replaceAll("_", " ") ?? "not installed",
            },
            {
              label: "Security review",
              value: app.securityReviewPassed ? "passed" : "pending",
            },
            {
              label: "Real customer data",
              value: app.realCustomerDataEnabled ? "enabled" : "disabled",
            },
          ]}
          links={[
            {
              label: "Explore catalogue",
              to: "/app-store/$section",
              params: { section: "explore" },
              hint: "Return to the App Store catalogue",
            },
            {
              label: "CSV / import alternative",
              to: "/imports",
              hint: "Use file import when a connector is unavailable",
            },
            {
              label: "Public API docs",
              to: "/developer/$section",
              params: { section: "api-docs" },
              hint: "Developer portal documentation",
            },
          ]}
          footer="Install stays fail-closed until verified E2E sync and activation gates pass. No fabricated readiness."
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/app-store/$section" params={{ section: "explore" }}>
              Back to explore
            </Link>
          </Button>
          {canRequest ? (
            <Button
              size="sm"
              disabled={installMutation.isPending || already || action === "blocked"}
              onClick={() => installMutation.mutate()}
            >
              {already
                ? "Interest already recorded"
                : installable
                  ? "Install"
                  : action === "request"
                    ? "Register interest"
                    : "Not available"}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to="/imports" search={{ module: undefined }}>
              CSV / import alternative
            </Link>
          </Button>
        </div>
      }
    >
      <AppStoreSubnav current="explore" />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {app.kind === "native"
              ? "Native"
              : app.kind === "partner_api"
                ? "Partner API"
                : "Hybrid"}
          </Badge>
          <Badge variant="secondary">{connectorStatusLabel(app.implementationStatus)}</Badge>
          <Badge variant="outline">{app.pricingModel.replaceAll("_", " ")}</Badge>
          {app.installStatus && app.installStatus !== "not_installed" ? (
            <Badge>{app.installStatus}</Badge>
          ) : null}
        </div>
        <TrustBadges trust={app} />
        {app.privacyDisclosure ? (
          <p className="text-sm text-muted-foreground">{app.privacyDisclosure}</p>
        ) : null}
        {app.breakingChangeNotes || app.deprecationAt ? (
          <Alert>
            <AlertTitle>Compatibility notice</AlertTitle>
            <AlertDescription>
              {app.deprecationAt ? `Deprecation date: ${app.deprecationAt}. ` : null}
              {app.breakingChangeNotes ?? "Review version compatibility before upgrading."}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {!activation.allowed ? (
        <Alert className="mb-6">
          <AlertTitle>Real customer data locked (fail closed)</AlertTitle>
          <AlertDescription>
            {activation.reason}{" "}
            {!e2e
              ? (app.blockerNotes ??
                "Install remains limited to interest registration until real sync is verified.")
              : null}
            {app.kind === "partner_api"
              ? " Partner integrations require API availability, cooperation and technical approvals, then connect through the LinkBooks public API and developer portal."
              : null}{" "}
            Security review: {app.securityReviewPassed ? "passed" : "pending"}. Real-data flag:{" "}
            {app.realCustomerDataEnabled ? "enabled" : "disabled"}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              <p>{app.description}</p>
              <p className="text-muted-foreground">Publisher: {app.publisherName}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capabilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium">Categories</p>
                <p className="text-muted-foreground">
                  {app.categoryCodes.map((c) => appCategoryByCode(c)?.name ?? c).join(", ") || "—"}
                </p>
              </div>
              <div>
                <p className="font-medium">Supported countries</p>
                <p className="text-muted-foreground">{app.countries.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="font-medium">LinkBooks modules</p>
                <p className="text-muted-foreground">{app.modules.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="font-medium">Synchronization</p>
                <p className="text-muted-foreground">
                  {app.syncCapabilities.join(", ") || "None declared"}
                </p>
              </div>
              <div>
                <p className="font-medium">Authentication</p>
                <p className="text-muted-foreground">{app.authMethods.join(", ") || "—"}</p>
              </div>
              {app.requestedApiScopes.length > 0 ? (
                <div>
                  <p className="font-medium">Requested public API scopes</p>
                  <p className="text-muted-foreground">{app.requestedApiScopes.join(", ")}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Next steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {app.kind === "partner_api" ? (
                <p>
                  Register a publisher application in the{" "}
                  <Link to="/developer" className="underline underline-offset-2">
                    Developer portal
                  </Link>{" "}
                  and request the scopes listed above.
                </p>
              ) : (
                <p>
                  Native connector work continues in later batches. Production Install unlocks only
                  after verified E2E synchronization.
                </p>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link to="/developer/$section" params={{ section: "api-docs" }}>
                  Public API documentation
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <AppStoreInstallWizard
          app={app}
          companyName={company.name}
          hasInstallPermission={canInstall}
        />
      </div>
    </RecordWorkspace>
  );
}
