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
import { listCompanySyncJobs } from "@/lib/app-store/app-store.functions";
import { deriveIntegrationExceptions } from "@/lib/app-store/exceptions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreExceptionsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.resolve_exceptions" as Permission) || can("appstore.view" as Permission);
  const fetchJobs = useServerFn(listCompanySyncJobs);
  const jobs = useQuery({
    queryKey: ["app-store-sync-jobs", company?.id],
    queryFn: () => fetchJobs({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Integration Exceptions" description="App Store">
        <EmptyState
          title="No access"
          description="Requires appstore.resolve_exceptions or appstore.view."
        />
      </ListWorkspace>
    );
  }

  const exceptions = deriveIntegrationExceptions(jobs.data ?? []);

  return (
    <ListWorkspace
      title="Integration Exceptions"
      description="Failed, partial and dead-letter sync jobs for this organisation. Empty until a verified connector runs."
      subnav={<AppStoreSubnav current="exceptions" />}
    >
      <Alert className="mb-6">
        <AlertTitle>No fabricated exceptions</AlertTitle>
        <AlertDescription>
          Exceptions are derived from durable sync jobs only. Resolve actions unlock after a live
          connector produces recoverable failures.
        </AlertDescription>
      </Alert>

      {jobs.isPending || jobs.isLoading ? (
        <LoadingState />
      ) : jobs.isError ? (
        <QueryErrorState queries={[jobs]} title="Could not load exceptions" />
      ) : jobs.isSuccess ? (
        exceptions.length === 0 ? (
          <EmptyState
            title="No integration exceptions"
            description="When a verified connector fails records, they appear here with correlation IDs for retry."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/app-store/$section" params={{ section: "sync-activity" }}>
                  View sync activity
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
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Correlation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.appCode}</TableCell>
                    <TableCell>
                      <Badge variant={row.severity === "error" ? "destructive" : "secondary"}>
                        {row.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      {row.summary}
                    </TableCell>
                    <TableCell>{row.failedCount}</TableCell>
                    <TableCell className="font-mono text-xs">{row.correlationId}</TableCell>
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
