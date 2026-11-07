import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreHero } from "@/components/app-store/AppStoreHero";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { MarketplaceAppCard } from "@/components/app-store/MarketplaceAppCard";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { categoryCounts } from "@/lib/app-store/catalogue";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { useState } from "react";

export function AppStoreOverviewPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
  const [query, setQuery] = useState("");
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <CompanyEmptyState
        title="No organisation"
        description="Select a company to browse the App Store."
      />
    );
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="App Store" description="Integrations marketplace." />
        <EmptyState
          title="No App Store access"
          description="Ask an administrator for appstore.view."
        />
      </>
    );
  }
  if (catalogue.isLoading) {
    return (
      <>
        <PageHeader
          title="App Store"
          description="Connect third-party software to LinkBooks through a secure open platform."
        />
        <AppStoreSubnav current="overview" />
        <LoadingState />
      </>
    );
  }
  if (catalogue.isError) {
    return (
      <ErrorState
        title="Could not load App Store"
        description={friendlyAuthError(catalogue.error)}
        onRetry={() => catalogue.refetch()}
      />
    );
  }

  const apps = catalogue.data?.apps ?? [];
  const featured = apps.filter((a) => a.featured).slice(0, 6);
  const recommended = apps.filter((a) => a.recommended).slice(0, 6);
  const recentlyAdded = apps.filter((a) => a.recentlyAdded).slice(0, 6);
  const installed = apps.filter((a) => a.installStatus === "installed");
  const categories = categoryCounts(apps);
  const roadmap = catalogue.data?.nativeRoadmap ?? [];
  const verifiedCount = roadmap.filter((r) => r.e2eVerified).length;

  return (
    <>
      <AppStoreHero
        title="Connect your stack to LinkBooks"
        description={`Native Amazon, Shopify and Stripe first — partners like Hubdoc and Link My Books via the public API. ${verifiedCount} of ${roadmap.length || 0} native adapters are E2E verified. Real customer data stays locked until security gates pass.`}
        actions={
          <>
            <Button asChild size="sm">
              <Link to="/app-store/$section" params={{ section: "explore" }}>
                Explore all apps
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app-store/$section" params={{ section: "register" }}>
                Integration register
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/developer">Developer portal</Link>
            </Button>
          </>
        }
      />
      <AppStoreSubnav current="overview" />

      <Alert className="mb-6">
        <AlertTitle>Fail closed</AlertTitle>
        <AlertDescription>
          Catalogue source: {catalogue.data?.source ?? "defaults"}
          {catalogue.data?.ready ? "" : " (migration not applied — using defaults)"}. Use Privacy
          &amp; Access to review consents and revoke connections. Install remains interest-only
          until E2E verification, security review and real-data enablement.
        </AlertDescription>
      </Alert>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps, publishers and capabilities"
          aria-label="Search App Store"
          className="sm:max-w-md"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const value = query.trim();
              window.location.assign(
                value ? `/app-store/explore?q=${encodeURIComponent(value)}` : "/app-store/explore",
              );
            }
          }}
        />
        <Button asChild>
          <a
            href={
              query.trim()
                ? `/app-store/explore?q=${encodeURIComponent(query.trim())}`
                : "/app-store/explore"
            }
          >
            Search
          </a>
        </Button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Catalogue apps",
            value: apps.length,
            body: (
              <p className="text-sm text-muted-foreground">
                Published listings available to browse.
              </p>
            ),
          },
          {
            label: "Installed / requested",
            value: installed.length,
            body: (
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/app-store/$section" params={{ section: "my-apps" }}>
                  Open My Apps
                </Link>
              </Button>
            ),
          },
          {
            label: "Categories",
            value: categories.length,
            body: (
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/app-store/$section" params={{ section: "categories" }}>
                  Browse categories
                </Link>
              </Button>
            ),
          },
          {
            label: "E2E verified natives",
            value: verifiedCount,
            body: (
              <p className="text-sm text-muted-foreground">Install stays blocked until verified.</p>
            ),
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            className="border-border/80 bg-card/90 transition-colors hover:border-primary/30"
          >
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>{stat.body}</CardContent>
          </Card>
        ))}
      </div>

      <section className="mb-10 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Featured</h2>
            <p className="text-sm text-muted-foreground">
              Priority native connectors and partner API listings.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/app-store/$section" params={{ section: "featured" }}>
              View all
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featured.map((app) => (
            <MarketplaceAppCard key={app.code} app={app} />
          ))}
        </div>
      </section>

      <section className="mb-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recommended</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recommended.map((app) => (
            <MarketplaceAppCard key={app.code} app={app} />
          ))}
        </div>
      </section>

      <section className="mb-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recently added</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recentlyAdded.map((app) => (
            <MarketplaceAppCard key={app.code} app={app} />
          ))}
        </div>
      </section>

      <section className="mb-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Popular categories</h2>
        <div className="flex flex-wrap gap-2">
          {categories.slice(0, 12).map((cat) => (
            <Button key={cat.code} asChild variant="secondary" size="sm">
              <a href={`/app-store/explore?category=${encodeURIComponent(cat.code)}`}>
                {cat.name} ({cat.count})
              </a>
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Native connector roadmap</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {roadmap.map((item) => (
            <Card key={item.code}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.displayName}</CardTitle>
                <CardDescription>{item.status}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {item.e2eVerified
                    ? "E2E synchronization verified."
                    : "Not complete — pending verified end-to-end synchronization."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
