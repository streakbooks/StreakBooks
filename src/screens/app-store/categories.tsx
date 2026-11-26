import { useQuery } from "@tanstack/react-query";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { APP_CATEGORIES } from "@/lib/app-store/categories";
import { categoryCounts } from "@/lib/app-store/catalogue";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreCategoriesPage() {
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
      <ListWorkspace title="Categories" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view." />
      </ListWorkspace>
    );
  }
  if (catalogue.isLoading) {
    return (
      <ListWorkspace
        title="Categories"
        description="Browse the marketplace taxonomy."
        subnav={<AppStoreSubnav current="categories" />}
      >
        <LoadingState />
      </ListWorkspace>
    );
  }
  if (catalogue.isError) {
    return <QueryErrorState queries={[catalogue]} title="Could not load categories" />;
  }
  if (!catalogue.isSuccess) return null;
  const counts = new Map(categoryCounts(catalogue.data?.apps ?? []).map((c) => [c.code, c.count]));

  return (
    <ListWorkspace
      title="Categories"
      description="Configurable taxonomy covering e-commerce, payments, document capture and more."
      subnav={<AppStoreSubnav current="categories" />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {APP_CATEGORIES.map((cat) => {
          const count = counts.get(cat.code) ?? 0;
          return (
            <a
              key={cat.code}
              href={`/app-store/explore?category=${encodeURIComponent(cat.code)}`}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="text-lg">{cat.name}</CardTitle>
                  <CardDescription>
                    {cat.description} · {count} app{count === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
              </Card>
            </a>
          );
        })}
      </div>
    </ListWorkspace>
  );
}
