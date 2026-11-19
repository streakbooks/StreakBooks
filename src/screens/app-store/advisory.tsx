import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { listFirmAppRecommendations } from "@/lib/app-store/app-store.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

/** Accountant App Advisory (XP-02) — firm recommends apps to authorized clients. */
export function AppStoreAdvisoryPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdvise = can("appstore.advise" as Permission);
  const fetchRecommendations = useServerFn(listFirmAppRecommendations);
  const recommendations = useQuery({
    queryKey: ["firm-app-recommendations", company?.id],
    queryFn: () => fetchRecommendations({ data: { firmId: company!.id } }),
    enabled: Boolean(company?.id) && canAdvise,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <CompanyEmptyState
        title="No organisation"
        description="Select the practice organisation that advises clients."
      />
    );
  }
  if (!canAdvise) {
    return (
      <ListWorkspace title="Accountant Advisory" description="App Store">
        <EmptyState
          title="No advisory access"
          description="Requires appstore.advise on the practice organisation."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Accountant Advisory"
      description="Recommend apps to authorized client organisations, request approvals and monitor integrations — without bypassing client consent."
      subnav={<AppStoreSubnav current="advisory" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Practice-scoped recommendations</AlertTitle>
        <AlertDescription>
          Recommendations require an authorized firm–client relationship. Clients must approve
          before installation proceeds. Live multi-client connection monitoring continues as
          practice authorization RPCs are wired; this workspace does not invent client access.
        </AlertDescription>
      </Alert>

      {recommendations.isLoading ? <LoadingState /> : null}
      {recommendations.isError ? (
        <QueryErrorState queries={[recommendations]} title="Could not load recommendations" />
      ) : null}

      {!recommendations.isLoading && !recommendations.isError ? (
        (recommendations.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Create recommendations for authorized clients from Explore once firm–client linking is confirmed for the target organisation."
            action={
              <Button asChild>
                <Link to="/app-store/$section" params={{ section: "explore" }}>
                  Explore apps to recommend
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client company</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rationale</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.clientCompanyId}</TableCell>
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
                      <Badge variant="secondary">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground">
                      {row.rationale || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.updatedAt || "—"}</TableCell>
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
