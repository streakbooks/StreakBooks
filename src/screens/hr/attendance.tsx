import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  decideHrAttendanceCorrection,
  listHrAttendanceCorrections,
  listHrAttendanceLogs,
  upsertHrAttendanceCorrection,
  upsertHrAttendanceLog,
} from "@/lib/hr/time.functions";
import { HR_ATTENDANCE_STATUSES } from "@/lib/hr/time-types";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HrAttendancePage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.attendance.manage");
  const canManager = useCanDo("hr.manager");
  const queryClient = useQueryClient();

  const fetchLogs = useServerFn(listHrAttendanceLogs);
  const fetchCorrections = useServerFn(listHrAttendanceCorrections);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveLog = useServerFn(upsertHrAttendanceLog);
  const saveCorrection = useServerFn(upsertHrAttendanceCorrection);
  const decideCorrection = useServerFn(decideHrAttendanceCorrection);

  const [logOpen, setLogOpen] = useState(false);
  const [corrOpen, setCorrOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [reqIn, setReqIn] = useState("");
  const [reqOut, setReqOut] = useState("");

  const logsQ = useQuery({
    queryKey: ["hr-attendance-logs", company?.id],
    queryFn: () => fetchLogs({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const correctionsQ = useQuery({
    queryKey: ["hr-attendance-corrections", company?.id],
    queryFn: () => fetchCorrections({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-attendance", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && (logOpen || corrOpen),
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-attendance-logs", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-attendance-corrections", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-dashboard", company?.id] });
  };

  const saveLogM = useMutation({
    mutationFn: () =>
      saveLog({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            workDate,
            checkInAt: checkInAt ? new Date(checkInAt).toISOString() : null,
            checkOutAt: checkOutAt ? new Date(checkOutAt).toISOString() : null,
            source: "manual",
            status,
            notes: notes.trim() || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Attendance log saved");
      setLogOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const saveCorrM = useMutation({
    mutationFn: () =>
      saveCorrection({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            workDate,
            requestedCheckInAt: reqIn ? new Date(reqIn).toISOString() : null,
            requestedCheckOutAt: reqOut ? new Date(reqOut).toISOString() : null,
            reason: reason.trim(),
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Correction submitted");
      setCorrOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const decideM = useMutation({
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
      toast.success("Correction decided");
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title="Attendance"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Attendance" }]}
        subnav={<HrSubnav current="attendance" />}
      >
        <EmptyState title="No access" description="You need hr.view to open attendance." />
      </ListWorkspace>
    );
  }

  const logs = logsQ.data?.items ?? [];
  const corrections = correctionsQ.data?.items ?? [];
  const employees = employeesQ.data?.items ?? [];

  return (
    <ListWorkspace
      title="Attendance"
      description="Check-in/out logs, exceptions, and regularization workflow."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Attendance" }]}
      actions={
        <>
          {(canManage || canManager) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEmployeeId("");
                setWorkDate(new Date().toISOString().slice(0, 10));
                setReqIn("");
                setReqOut("");
                setReason("");
                setCorrOpen(true);
              }}
            >
              Request correction
            </Button>
          )}
          {canManage && (
            <Button
              type="button"
              onClick={() => {
                setEmployeeId("");
                setWorkDate(new Date().toISOString().slice(0, 10));
                setCheckInAt(toLocalInput(new Date().toISOString()));
                setCheckOutAt("");
                setStatus("open");
                setNotes("");
                setLogOpen(true);
              }}
            >
              Record attendance
            </Button>
          )}
        </>
      }
      subnav={<HrSubnav current="attendance" />}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Attendance logs
      </h2>
      {logsQ.isLoading ? (
        <LoadingState />
      ) : logsQ.isError ? (
        <QueryErrorState queries={[logsQ]} title="Could not load attendance" />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No attendance logs yet"
          description="Record check-in/out entries or wait for self-service punches (HR-07)."
          action={
            canManage ? (
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setEmployeeId("");
                  setWorkDate(new Date().toISOString().slice(0, 10));
                  setCheckInAt(toLocalInput(new Date().toISOString()));
                  setCheckOutAt("");
                  setStatus("open");
                  setNotes("");
                  setLogOpen(true);
                }}
              >
                Record attendance
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">{row.employeeNumber}</div>
                  </TableCell>
                  <TableCell>{row.workDate}</TableCell>
                  <TableCell>
                    {row.checkInAt ? new Date(row.checkInAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    {row.checkOutAt ? new Date(row.checkOutAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Corrections
      </h2>
      {correctionsQ.isLoading ? (
        <LoadingState />
      ) : corrections.length === 0 ? (
        <p className="text-muted-foreground text-sm">No correction requests.</p>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corrections.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.employeeName ?? "—"}</TableCell>
                  <TableCell>{row.workDate}</TableCell>
                  <TableCell className="max-w-[240px] truncate">{row.reason}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {canManage && row.status === "submitted" && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={decideM.isPending}
                          onClick={() =>
                            decideM.mutate({ correctionId: row.id, decision: "approved" })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={decideM.isPending}
                          onClick={() =>
                            decideM.mutate({ correctionId: row.id, decision: "rejected" })
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

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record attendance</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              {employeesQ.isError && employeesQ.data === undefined ? (
                <QueryErrorState queries={[employeesQ]} title="Could not load employees" />
              ) : (
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
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Work date</Label>
              <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Check-in</Label>
              <Input
                type="datetime-local"
                value={checkInAt}
                onChange={(e) => setCheckInAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Check-out</Label>
              <Input
                type="datetime-local"
                value={checkOutAt}
                onChange={(e) => setCheckOutAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <RecordLookupSelect value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_ATTENDANCE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !workDate || saveLogM.isPending}
              onClick={() => saveLogM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={corrOpen} onOpenChange={setCorrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attendance correction</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              {employeesQ.isError && employeesQ.data === undefined ? (
                <QueryErrorState queries={[employeesQ]} title="Could not load employees" />
              ) : (
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
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Work date</Label>
              <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Requested check-in</Label>
              <Input
                type="datetime-local"
                value={reqIn}
                onChange={(e) => setReqIn(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Requested check-out</Label>
              <Input
                type="datetime-local"
                value={reqOut}
                onChange={(e) => setReqOut(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCorrOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !workDate || !reason.trim() || saveCorrM.isPending}
              onClick={() => saveCorrM.mutate()}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
