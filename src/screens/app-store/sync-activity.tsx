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
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";

export function AppStoreSyncActivityPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view_sync" as Permission) || can("appstore.view" as Permission);
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
      <ListWorkspace title="Synchronization Activity" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view_sync or appstore.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Synchronization Activity"
      description="Durable sync jobs with correlation IDs, retries and checkpoints. Empty until a verified connector runs."
      subnav={<AppStoreSubnav current="sync-activity" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Engine ready — connectors not E2E verified</AlertTitle>
        <AlertDescription>
          Job queue, idempotency keys and webhook delivery tables are in place. No fabricated sync
          history is shown. Jobs appear only after a genuine connector run.
        </AlertDescription>
      </Alert>

      {jobs.isLoading ? <LoadingState /> : null}
      {jobs.isError ? (
        <QueryErrorState queries={[jobs]} title="Could not load sync jobs" />
      ) : null}

      {!jobs.isLoading && !jobs.isError ? (
        (jobs.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No synchronization jobs"
            description="When a verified connector runs, durable jobs will list here with import/skip/fail counts."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/app-store/$section" params={{ section: "connections" }}>
                  Open connections
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Counts</TableHead>
                  <TableHead>Correlation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data?.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.id.slice(0, 8)}</TableCell>
                    <TableCell>{job.appCode}</TableCell>
                    <TableCell>{job.trigger}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{job.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.imported}/{job.discovered} · skip {job.skipped} · fail {job.failed}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{job.correlationId}</TableCell>
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
