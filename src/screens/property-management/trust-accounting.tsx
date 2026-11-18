import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { PmSubnav } from "@/components/property-management/PmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPmSettings } from "@/lib/property-management/pm.functions";
import { getPmTrustSummary } from "@/lib/property-management/pm-posting.functions";
import type { Permission } from "@/lib/permissions";

export function PmTrustAccountingPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("property.view" as Permission) || can("property.trust.reconcile" as Permission);
  const fetchSettings = useServerFn(getPmSettings);
  const fetchTrust = useServerFn(getPmTrustSummary);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const trust = useQuery({
    queryKey: ["pm-trust-summary", company?.id],
    queryFn: () => fetchTrust({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Trust Accounting" description="Client-money readiness summary.">
        <PmSubnav current="trust-accounting" />
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  const summary = trust.data;

  return (
    <ListWorkspace
      title="Trust Accounting"
      description="Readiness and control totals for client money. This is not a certified statutory trust reconciliation."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Trust Accounting" },
      ]}
      actions={
        <Button type="button" variant="outline" asChild>
          <Link to="/property-management/$section" params={{ section: "settings" }}>
            Map accounts
          </Link>
        </Button>
      }
    >
      <PmSubnav current="trust-accounting" />
      {!settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          {trust.isLoading ? <LoadingState /> : null}
          {trust.isError ? (
            <ErrorState
              title="Could not load trust summary"
              description={friendlyAuthError(trust.error)}
              onRetry={() => trust.refetch()}
            />
          ) : null}
          {summary ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>COA readiness</CardTitle>
                  <CardDescription>
                    Posting requires rent, receivable, payable, commission and operating bank mappings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>COA ready: {summary.coaReady ? "Yes" : "No — configure Settings"}</p>
                  <p>Trust bank mapped: {summary.trustBankMapped ? "Yes" : "No"}</p>
                  <p>Operating bank mapped: {summary.operatingBankMapped ? "Yes" : "No"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Control totals</CardTitle>
                  <CardDescription>
                    Operational counts only — not a bank statement balance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>Open draft payouts: {summary.openDistributionDraftCount}</p>
                  <p>
                    Posted payout total:{" "}
                    {(summary.postedDistributionTotalMinor / 100).toFixed(2)}
                  </p>
                  <p>Active portal grants: {summary.activePortalCount}</p>
                  <p>Active reserves total: {(summary.reserveTotalMinor / 100).toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </ListWorkspace>
  );
}
