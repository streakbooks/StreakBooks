import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PmSubnav } from "@/components/property-management/PmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPmDashboardKpis, getPmSettings } from "@/lib/property-management/pm.functions";
import type { Permission } from "@/lib/permissions";

function KpiCard({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string | number;
  hint: string;
  to?: "properties" | "units" | "owners" | "agreements" | "settings";
}) {
  const body = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
  if (!to) return body;
  return (
    <Link
      to="/property-management/$section"
      params={{ section: to }}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

export function PmOverviewPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canOpen =
    can("property.view" as Permission) || can("property.settings.manage" as Permission);
  const fetchSettings = useServerFn(getPmSettings);
  const fetchKpis = useServerFn(getPmDashboardKpis);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  const kpis = useQuery({
    queryKey: ["pm-dashboard-kpis", company?.id],
    queryFn: () => fetchKpis({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace
        title="Property Management"
        description="Portfolios, owners and settlement."
      >
        <EmptyState
          title="No Property Management access"
          description="Ask an administrator for property.view permission."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Property Management"
      description="Portfolio operations and owner settlement — posts through the LinkBooks ledger when COA mappings are configured."
      breadcrumbs={[{ label: "Property Management" }]}
      actions={
        can("property.manage" as Permission) ? (
          <Button asChild>
            <Link to="/property-management/$section" params={{ section: "properties" }}>
              Properties
            </Link>
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="overview" />}
    >

      {settings.isError ? (
        <ErrorState
          title="Could not load Property Management settings"
          description={friendlyAuthError(settings.error)}
        onRetry={() => settings.refetch()}
        />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : !settings.data?.enabled ? (
        <Alert>
          <AlertTitle>Module not enabled</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Enable Property Management in Settings before creating properties. Financial owner
              statements and payouts remain fail-closed until later batches.
            </span>
            {can("property.settings.manage" as Permission) ? (
              <Button asChild size="sm">
                <Link to="/property-management/$section" params={{ section: "settings" }}>
                  Open settings
                </Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : kpis.isError ? (
        <ErrorState
          title="Could not load portfolio counts"
          description={friendlyAuthError(kpis.error)}
        onRetry={() => kpis.refetch()}
        />
      ) : kpis.isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Properties"
            value={kpis.data?.propertyCount ?? 0}
            hint="Buildings and houses in the register"
            to="properties"
          />
          <KpiCard
            label="Units"
            value={kpis.data?.unitCount ?? 0}
            hint="Unit records under properties"
            to="units"
          />
          <KpiCard
            label="Owners"
            value={kpis.data?.ownerCount ?? 0}
            hint="Owner overlays on Contacts"
            to="owners"
          />
          <KpiCard
            label="Active agreements"
            value={kpis.data?.activeAgreementCount ?? 0}
            hint="Management agreements in force"
            to="agreements"
          />
        </div>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        {kpis.data?.currencyNote ??
          "Count KPIs only — monetary totals require period, basis and currency once posting lands."}
      </p>
    </ListWorkspace>
  );
}
