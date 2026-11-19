import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

/**
 * Ratings & reviews — never fabricates user reviews.
 * Until a reviews table + submission RPC ship, this lists catalogue apps with zero genuine reviews.
 */
export function AppStoreReviewsPage() {
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
      <ListWorkspace title="Ratings & Reviews" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view." />
      </ListWorkspace>
    );
  }

  const apps = catalogue.data?.apps ?? [];

  return (
    <ListWorkspace
      title="Ratings & Reviews"
      description="Genuine customer ratings only. Fabricated or seeded star ratings are never shown."
      subnav={<AppStoreSubnav current="reviews" />}
    >
      <Alert className="mb-6">
        <AlertTitle>No fabricated reviews</AlertTitle>
        <AlertDescription>
          Review submission opens after verified installs. Until then each listing correctly shows
          zero published reviews.
        </AlertDescription>
      </Alert>

      {catalogue.isLoading ? <LoadingState /> : null}
      {catalogue.isError ? (
        <QueryErrorState queries={[catalogue]} title="Could not load listings" />
      ) : null}

      {!catalogue.isLoading && !catalogue.isError ? (
        apps.length === 0 ? (
          <EmptyState
            title="No listings"
            description="Catalogue is empty."
            action={
              <Button asChild size="sm">
                <Link to="/app-store/$section" params={{ section: "explore" }}>
                  Explore apps
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
                  <TableHead>Published reviews</TableHead>
                  <TableHead>Average rating</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.code}>
                    <TableCell>{app.name}</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-muted-foreground">
                      Awaiting genuine reviews after verified install
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </ListWorkspace>
  );
}
