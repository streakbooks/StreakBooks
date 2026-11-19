import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
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
import { useCanDo } from "@/hooks/use-can";

import { listHrApprovalsInbox, listHrManagerTeam } from "@/lib/hr/workspace.functions";

export function HrManagerPage() {
  const { company, isPending } = useActiveCompany();
  const canManager = useCanDo("hr.manager");
  const canApprove = useCanDo("hr.leave.approve");
  const canApprovals = useCanDo("hr.approvals.manage");
  const allowed = canManager || canApprove || canApprovals;

  const fetchTeam = useServerFn(listHrManagerTeam);
  const fetchInbox = useServerFn(listHrApprovalsInbox);

  const teamQ = useQuery({
    queryKey: ["hr-manager-team", company?.id],
    queryFn: () => fetchTeam({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManager,
    retry: false,
  });

  const inboxQ = useQuery({
    queryKey: ["hr-approvals-inbox-manager", company?.id],
    queryFn: () => fetchInbox({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && allowed,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!allowed) {
    return (
      <ListWorkspace
        title="Manager Workspace"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Manager Workspace" }]}
        subnav={<HrSubnav current="manager" />}
      >
        <EmptyState
          title="No access"
          description="You need manager or leave approval permission."
        />
      </ListWorkspace>
    );
  }

  const team = teamQ.data?.items ?? [];
  const leave = inboxQ.data?.leave ?? [];
  const corrections = inboxQ.data?.attendanceCorrections ?? [];

  return (
    <ListWorkspace
      title="Manager Workspace"
      description="Team directory and pending leave / attendance exceptions for your reports."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Manager Workspace" }]}
      actions={
        <Button type="button" variant="outline" asChild>
          <Link to="/hr/$section" params={{ section: "approvals" }}>
            Open approvals inbox
          </Link>
        </Button>
      }
      subnav={<HrSubnav current="manager" />}
    >
      {canManager && (
        <section className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            My team
          </h2>
          {teamQ.isPending ? (
            <LoadingState />
          ) : teamQ.isError ? (
            <QueryErrorState queries={[teamQ]} title="Could not load team" />
          ) : !teamQ.data?.linked ? (
            <EmptyState
              title="Manager account not linked"
              description={
                teamQ.data?.message ??
                "Link your login to an employee profile and set manager relationships on team profiles."
              }
            />
          ) : team.length === 0 ? (
            <EmptyState
              title="No direct reports"
              description="Assign yourself as manager on employee profiles to populate this list."
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">
                          {row.firstName} {row.lastName}
                        </div>
                        <div className="text-muted-foreground text-xs">{row.employeeNumber}</div>
                      </TableCell>
                      <TableCell>{row.departmentName ?? "—"}</TableCell>
                      <TableCell>{row.designationName ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </section>
      )}

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pending leave
        </h2>
        {inboxQ.isPending ? (
          <LoadingState />
        ) : leave.length === 0 ? (
          <EmptyState
            title="No pending leave"
            description="Team leave approvals will appear here."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leave.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.employeeName ?? "—"}</TableCell>
                    <TableCell>{row.summary}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pending attendance corrections
        </h2>
        {corrections.length === 0 ? (
          <EmptyState
            title="No pending corrections"
            description="Attendance regularization requests for your team appear here."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrections.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.employeeName ?? "—"}</TableCell>
                    <TableCell>{row.summary}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>
    </ListWorkspace>
  );
}
