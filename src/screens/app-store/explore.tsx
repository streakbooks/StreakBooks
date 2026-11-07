import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreHero } from "@/components/app-store/AppStoreHero";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { MarketplaceAppCard } from "@/components/app-store/MarketplaceAppCard";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { APP_CATEGORIES } from "@/lib/app-store/categories";
import { filterMarketplaceApps, MARKETPLACE_COUNTRIES } from "@/lib/app-store/catalogue";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

function initialSearchParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

export function AppStoreExplorePage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
  const [query, setQuery] = useState(() => initialSearchParam("q") ?? "");
  const [category, setCategory] = useState(() => initialSearchParam("category") ?? "all");
  const [country, setCountry] = useState(() => initialSearchParam("country") ?? "all");
  const [pricing, setPricing] = useState(() => initialSearchParam("pricing") ?? "all");
  const [kind, setKind] = useState(() => initialSearchParam("kind") ?? "all");

  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const filtered = useMemo(() => {
    return filterMarketplaceApps(catalogue.data?.apps ?? [], {
      query,
      category: category === "all" ? null : category,
      country: country === "all" ? null : country,
      pricing: pricing === "all" ? null : pricing,
      kind: kind === "all" ? null : kind,
    });
  }, [catalogue.data?.apps, query, category, country, pricing, kind]);

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Explore All Apps" description="App Store" />
        <EmptyState title="No access" description="Requires appstore.view." />
      </>
    );
  }

  return (
    <>
      <AppStoreHero
        title="Explore the marketplace"
        description="Search published listings by capability, country and pricing. Results use the database catalogue when migrations are applied, otherwise local defaults — never inventing live connections."
      />
      <AppStoreSubnav current="explore" />

      {catalogue.isLoading ? <LoadingState /> : null}
      {catalogue.isError ? (
        <ErrorState
          title="Could not load catalogue"
          description={friendlyAuthError(catalogue.error)}
          onRetry={() => catalogue.refetch()}
        />
      ) : null}

      {!catalogue.isLoading && !catalogue.isError ? (
        <>
          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, description, capabilities"
              aria-label="Filter apps"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {APP_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.code} value={cat.code}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger aria-label="Country">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {MARKETPLACE_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pricing} onValueChange={setPricing}>
              <SelectTrigger aria-label="Pricing">
                <SelectValue placeholder="Pricing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pricing</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="freemium">Freemium</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="usage">Usage-based</SelectItem>
                <SelectItem value="external_billed">Externally billed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="Integration kind">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="native">Native</SelectItem>
                <SelectItem value="partner_api">Partner API</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {filtered.length} app{filtered.length === 1 ? "" : "s"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setCountry("all");
                setPricing("all");
                setKind("all");
              }}
            >
              Clear filters
            </Button>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title="No matching apps"
              description="Try clearing filters or searching a different term."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((app) => (
                <MarketplaceAppCard key={app.code} app={app} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
