import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { MarketplaceAppCard } from "@/components/app-store/MarketplaceAppCard";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { filterMarketplaceApps } from "@/lib/app-store/catalogue";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreFeaturedPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
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
        <PageHeader title="Featured & Recommended" description="App Store" />
        <EmptyState title="No access" description="Requires appstore.view." />
      </>
    );
  }
  if (catalogue.isLoading) {
    return (
      <>
        <PageHeader title="Featured & Recommended" description="Eligibility-based collections." />
        <AppStoreSubnav current="featured" />
        <LoadingState />
      </>
    );
  }
  if (catalogue.isError) {
    return (
      <ErrorState
        title="Could not load featured apps"
        description={friendlyAuthError(catalogue.error)}
        onRetry={() => catalogue.refetch()}
      />
    );
  }

  const apps = catalogue.data?.apps ?? [];
  const featured = filterMarketplaceApps(apps, { featured: true });
  const recommended = filterMarketplaceApps(apps, { recommended: true });

  return (
    <>
      <PageHeader
        title="Featured & Recommended"
        description="Collections use catalogue flags and eligibility — not fabricated popularity metrics."
      />
      <AppStoreSubnav current="featured" />

      <section className="mb-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Featured</h2>
        {featured.length === 0 ? (
          <EmptyState title="No featured apps" description="Featured flags will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((app) => (
              <MarketplaceAppCard key={app.code} app={app} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recommended</h2>
        {recommended.length === 0 ? (
          <EmptyState
            title="No recommended apps"
            description="Recommended flags will appear here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recommended.map((app) => (
              <MarketplaceAppCard key={app.code} app={app} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
