import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { MarketplaceAppCard } from "@/components/app-store/MarketplaceAppCard";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { isCertified } from "@/lib/app-store/trust";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

/** Trust & Certification overview (XP-04 / XP-10). */
export function AppStoreTrustPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.view" as Permission) || can("appstore.manage_certification" as Permission);
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
      <>
        <PageHeader title="Trust & Certification" description="App Store" />
        <EmptyState title="No access" description="Requires appstore.view." />
      </>
    );
  }
  if (catalogue.isLoading) {
    return (
      <>
        <PageHeader title="Trust & Certification" description="Marketplace trust signals." />
        <AppStoreSubnav current="trust" />
        <LoadingState />
      </>
    );
  }
  if (catalogue.isError) {
    return (
      <ErrorState
        title="Could not load trust catalogue"
        description={friendlyAuthError(catalogue.error)}
        onRetry={() => catalogue.refetch()}
      />
    );
  }

  const apps = catalogue.data?.apps ?? [];
  const verified = apps.filter((a) => a.publisherVerified);
  const certified = apps.filter((a) => isCertified(a.certificationStatus));
  const withNotices = apps.filter((a) => a.deprecationAt || a.breakingChangeNotes);

  return (
    <>
      <PageHeader
        title="Trust & Certification"
        description="Verified publishers, certification status, privacy disclosures and compatibility notices."
      />
      <AppStoreSubnav current="trust" />

      <Alert className="mb-6">
        <AlertTitle>Certification is earned, not claimed</AlertTitle>
        <AlertDescription>
          LinkBooks Certified requires formal security, accounting, API, performance, accessibility
          and reliability reviews with periodic reassessment. Native apps may show verified
          publisher status before certification completes. Xero-level trust parity is not declared.
        </AlertDescription>
      </Alert>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Verified publishers</p>
          <p className="text-3xl font-semibold tabular-nums">{verified.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Certified apps</p>
          <p className="text-3xl font-semibold tabular-nums">{certified.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Compatibility notices</p>
          <p className="text-3xl font-semibold tabular-nums">{withNotices.length}</p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Catalogue trust posture</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <MarketplaceAppCard key={app.code} app={app} />
          ))}
        </div>
      </section>
    </>
  );
}
