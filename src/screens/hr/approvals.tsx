import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { decideHrAttendanceCorrection } from "@/lib/hr/time.functions";
import { decideHrLeaveRequest } from "@/lib/hr/time.functions";
import { listHrApprovalsInbox } from "@/lib/hr/workspace.functions";

export function HrApprovalsPage() {
  const { company, isPending } = useActiveCompany();
  const { can: hasPermission } = useCan();
  const can =
    hasPermission("hr.approvals.manage") ||
    hasPermission("hr.manager") ||
    hasPermission("hr.leave.approve") ||
    hasPermission("hr.attendance.manage");
  const canLeave =
    hasPermission("hr.leave.approve") ||
    hasPermission("hr.leave.manage") ||
    hasPermission("hr.manager");
  const canAttendance = hasPermission("hr.attendance.manage");
  const queryClient = useQueryClient();

  const fetchInbox = useServerFn(listHrApprovalsInbox);
  const decideLeave = useServerFn(decideHrLeaveRequest);
  const decideCorrection = useServerFn(decideHrAttendanceCorrection);

  const inboxQ = useQuery({
    queryKey: ["hr-approvals-inbox", company?.id],
    queryFn: () => fetchInbox({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && can,
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-approvals-inbox", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-approvals-inbox-manager", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-leave-requests", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-attendance-corrections", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-dashboard", company?.id] });
  };

  const leaveM = useMutation({
    mutationFn: (input: { requestId: string; decision: "approved" | "rejected" }) =>
      decideLeave({
        data: {
          companyId: company!.id,
          requestId: input.requestId,
          decision: input.decision,
          decisionNotes: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Leave decision saved");
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const corrM = useMutation({
    mutationFn: (input: { correctionId: string; decision: "approved" | "rejected" }) =>
      decideCorrection({
        data: {
          companyId: company!.id,
          correctionId: input.correctionId,
          decision: input.decision,
          decisionNotes: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Attendance correction decided");
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!can) {
    return (
      <ListWorkspace
        title="HR Approvals"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "HR Approvals" }]}
        subnav={<HrSubnav current="approvals" />}
      >
        <EmptyState title="No access" description="You need approval or manager permission." />
      </ListWorkspace>
    );
  }

  const leave = inboxQ.data?.leave ?? [];
  const corrections = inboxQ.data?.attendanceCorrections ?? [];

  return (
    <ListWorkspace
      title="HR Approvals"
      description="Multilevel inbox for submitted leave and attendance corrections."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "HR Approvals" }]}
      subnav={<HrSubnav current="approvals" />}
    >
      {inboxQ.isPending ? (
        <LoadingState />
      ) : inboxQ.isError ? (
        <QueryErrorState queries={[inboxQ]} title="Could not load approvals" />
      ) : (
        <>
          <section className="mb-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Leave requests
            </h2>
            {leave.length === 0 ? (
              <EmptyState
                title="No leave awaiting decision"
                description="Submitted leave appears here."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/hr/$section" params={{ section: "leave" }}>
                      Open leave
                    </Link>
                  </Button>
                }
              />
            ) : (
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="space-x-2 text-right">
                          {canLeave && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={leaveM.isPending}
                                onClick={() =>
                                  leaveM.mutate({ requestId: row.id, decision: "approved" })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={leaveM.isPending}
                                onClick={() =>
                                  leaveM.mutate({ requestId: row.id, decision: "rejected" })
                                }
                              >
                                Reject
                              </Button>
                            </>
                          )}
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
              Attendance corrections
            </h2>
            {corrections.length === 0 ? (
              <EmptyState
                title="No corrections awaiting decision"
                description="Submitted attendance corrections appear here."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/hr/$section" params={{ section: "attendance" }}>
                      Open attendance
                    </Link>
                  </Button>
                }
              />
            ) : (
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="space-x-2 text-right">
                          {canAttendance && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={corrM.isPending}
                                onClick={() =>
                                  corrM.mutate({ correctionId: row.id, decision: "approved" })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={corrM.isPending}
                                onClick={() =>
                                  corrM.mutate({ correctionId: row.id, decision: "rejected" })
                                }
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            )}
          </section>
        </>
      )}
    </ListWorkspace>
  );
}
