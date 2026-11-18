import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrEmployees } from "@/lib/hr/hr.functions";
import {
  createHrOffboardingCase,
  getHrOffboardingCase,
  listHrOffboardingCases,
  updateHrOffboardingTask,
} from "@/lib/hr/lifecycle-move.functions";
import { HrPayrollHandoffPanel } from "@/components/hr/HrPayrollHandoffPanel";
import { HR_EXIT_REASONS, HR_OFFBOARDING_TASK_STATUSES } from "@/lib/hr/lifecycle-move-types";

export function HrOffboardingPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.employees.manage");
  const qc = useQueryClient();
  const fetch = useServerFn(listHrOffboardingCases);
  const fetchDetail = useServerFn(getHrOffboardingCase);
  const fetchEmployees = useServerFn(listHrEmployees);
  const createCase = useServerFn(createHrOffboardingCase);
  const updateTask = useServerFn(updateHrOffboardingTask);
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [exitReason, setExitReason] = useState("resignation");
  const [notes, setNotes] = useState("");

  const listQ = useQuery({
    queryKey: ["hr-offboarding", company?.id],
    queryFn: () => fetch({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const detailQ = useQuery({
    queryKey: ["hr-offboarding-detail", company?.id, detailId],
    queryFn: () => fetchDetail({ data: { companyId: company!.id, caseId: detailId! } }),
    enabled: Boolean(company?.id) && Boolean(detailId),
    retry: false,
  });
  const empQ = useQuery({
    queryKey: ["hr-emp-exit", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && open,
    retry: false,
  });

  const inv = async () => {
    await qc.invalidateQueries({ queryKey: ["hr-offboarding", company?.id] });
    if (detailId)
      await qc.invalidateQueries({ queryKey: ["hr-offboarding-detail", company?.id, detailId] });
  };
  const createM = useMutation({
    mutationFn: () =>
      createCase({
        data: {
          companyId: company!.id,
          payload: {
            employeeId,
            lastWorkingDay,
            exitReason,
            noticeDate: null,
            payrollHandoffNote: null,
            notes: notes.trim() || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Offboarding case created");
      setOpen(false);
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const taskM = useMutation({
    mutationFn: (args: { taskId: string; status: string }) =>
      updateTask({
        data: { companyId: company!.id, taskId: args.taskId, status: args.status, notes: null },
      }),
    onSuccess: async () => {
      toast.success("Task updated");
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canView)
    return (
      <ListWorkspace
        title="Offboarding"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Offboarding" }]}
        subnav={<HrSubnav current="offboarding" />}
      >
        <EmptyState title="No access" description="You need hr.view." />
      </ListWorkspace>
    );

  const items = listQ.data?.items ?? [];
  const employees = empQ.data?.items ?? [];
  const detail = detailQ.data;

  return (
    <ListWorkspace
      title="Offboarding"
      description="Exit clearance checklists. Payroll termination is a handoff — HR never mutates finalized pay runs."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Offboarding" }]}
      actions={
        canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEmployeeId("");
              setLastWorkingDay(new Date().toISOString().slice(0, 10));
              setExitReason("resignation");
              setNotes("");
              setOpen(true);
            }}
          >
            Start offboarding
          </Button>
        ) : undefined
      }
      subnav={<HrSubnav current="offboarding" />}
    >
      {listQ.isPending ? (
        <LoadingState />
      ) : listQ.isError ? (
        <ErrorState
          title="Could not load offboarding"
          description={friendlyAuthError(listQ.error)}
          onRetry={() => void listQ.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No offboarding cases"
          description="Start an exit case to generate clearance tasks."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Last day</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payroll</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                  <TableCell className="font-medium">{r.caseNumber}</TableCell>
                  <TableCell>{r.employeeName ?? "—"}</TableCell>
                  <TableCell>{r.exitReason}</TableCell>
                  <TableCell>{r.lastWorkingDay}</TableCell>
                  <TableCell>{r.pendingTasks}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>{r.readyForPayroll ? "Ready" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <HrPayrollHandoffPanel companyId={company.id} />
      <Dialog
        open={Boolean(detailId)}
        onOpenChange={(v) => {
          if (!v) setDetailId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{detail?.case.caseNumber ?? "Offboarding case"}</DialogTitle>
          </DialogHeader>
          {detailQ.isPending ? (
            <LoadingState />
          ) : detailQ.isError ? (
            <ErrorState
              title="Could not load case"
              description={friendlyAuthError(detailQ.error)}
              onRetry={() => void detailQ.refetch()}
            />
          ) : detail ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {detail.case.employeeName} · {detail.case.exitReason} · last day{" "}
                {detail.case.lastWorkingDay}
                {detail.case.readyForPayroll ? " · ready for Payroll handoff" : ""}
              </p>
              {detail.case.payrollHandoffNote ? (
                <p className="rounded-md border p-3 text-sm">{detail.case.payrollHandoffNote}</p>
              ) : null}
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          {t.title}
                          {t.isRequired ? "" : " (optional)"}
                        </TableCell>
                        <TableCell>{t.ownerRole}</TableCell>
                        <TableCell>
                          <StatusBadge status={t.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && t.status === "pending" ? (
                            <RecordLookupSelect
                              onValueChange={(v) => taskM.mutate({ taskId: t.id, status: v })}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Update" />
                              </SelectTrigger>
                              <SelectContent>
                                {HR_OFFBOARDING_TASK_STATUSES.filter((s) => s !== "pending").map(
                                  (s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </RecordLookupSelect>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start offboarding</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              <RecordLookupSelect value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.employeeNumber} — {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Exit reason</Label>
              <RecordLookupSelect value={exitReason} onValueChange={setExitReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_EXIT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Last working day</Label>
              <Input
                type="date"
                value={lastWorkingDay}
                onChange={(e) => setLastWorkingDay(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !lastWorkingDay || createM.isPending}
              onClick={() => createM.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
