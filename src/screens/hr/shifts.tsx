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
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrEmployees } from "@/lib/hr/hr.functions";
import {
  listHrShiftAssignments,
  listHrShiftTemplates,
  upsertHrShiftAssignment,
  upsertHrShiftTemplate,
} from "@/lib/hr/time.functions";

export function HrShiftsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.attendance.manage");
  const queryClient = useQueryClient();

  const fetchShifts = useServerFn(listHrShiftTemplates);
  const fetchAssignments = useServerFn(listHrShiftAssignments);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveShift = useServerFn(upsertHrShiftTemplate);
  const saveAssignment = useServerFn(upsertHrShiftAssignment);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [employeeId, setEmployeeId] = useState("");
  const [shiftTemplateId, setShiftTemplateId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const shiftsQ = useQuery({
    queryKey: ["hr-shift-templates", company?.id],
    queryFn: () => fetchShifts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const assignmentsQ = useQuery({
    queryKey: ["hr-shift-assignments", company?.id],
    queryFn: () => fetchAssignments({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-shifts", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && assignOpen,
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-shift-templates", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-shift-assignments", company?.id] });
  };

  const saveShiftM = useMutation({
    mutationFn: () =>
      saveShift({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            code: code.trim(),
            name: name.trim(),
            timezone: timezone.trim() || null,
            startTime,
            endTime,
            breakMinutes,
            weeklyOffMask: 65,
            isActive: true,
            sortOrder: 100,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Shift template saved");
      setShiftOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const saveAssignM = useMutation({
    mutationFn: () =>
      saveAssignment({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            shiftTemplateId,
            effectiveFrom,
            effectiveTo: effectiveTo.trim() || null,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Shift assignment saved");
      setAssignOpen(false);
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
        title="Shifts & Rosters"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Shifts & Rosters" }]}
      >
        <HrSubnav current="shifts" />
        <EmptyState title="No access" description="You need hr.view to open shifts." />
      </ListWorkspace>
    );
  }

  const shifts = shiftsQ.data?.items ?? [];
  const assignments = assignmentsQ.data?.items ?? [];
  const employees = employeesQ.data?.items ?? [];
  const activeShifts = shifts.filter((s) => s.isActive);

  return (
    <ListWorkspace
      title="Shifts & Rosters"
      description="Shift templates, weekly offs, and employee roster assignments."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Shifts & Rosters" }]}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEmployeeId("");
                setShiftTemplateId(activeShifts[0]?.id ?? "");
                setEffectiveFrom(new Date().toISOString().slice(0, 10));
                setEffectiveTo("");
                setAssignOpen(true);
              }}
            >
              Assign shift
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCode("");
                setName("");
                setTimezone("UTC");
                setStartTime("09:00");
                setEndTime("17:00");
                setBreakMinutes(60);
                setShiftOpen(true);
              }}
            >
              New shift template
            </Button>
          </div>
        ) : undefined
      }
    >
      <HrSubnav current="shifts" />

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Shift templates
        </h2>
        {shiftsQ.isPending ? (
          <LoadingState />
        ) : shiftsQ.isError ? (
          <ErrorState
            title="Could not load shifts"
            description={friendlyAuthError(shiftsQ.error)}
            onRetry={() => void shiftsQ.refetch()}
          />
        ) : shifts.length === 0 ? (
          <EmptyState
            title="No shift templates"
            description="Define standard work schedules before assigning rosters."
            action={
              canManage ? (
                <Button type="button" onClick={() => setShiftOpen(true)}>
                  New shift template
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      {row.startTime.slice(0, 5)} – {row.endTime.slice(0, 5)}
                    </TableCell>
                    <TableCell>{row.breakMinutes} min</TableCell>
                    <TableCell>{row.timezone}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.isActive ? "active" : "inactive"} />
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
          Assignments
        </h2>
        {assignmentsQ.isPending ? (
          <LoadingState />
        ) : assignments.length === 0 ? (
          <EmptyState
            title="No roster assignments"
            description="Assign an active shift template to employees with an effective date."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.employeeName ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">{row.employeeNumber}</div>
                    </TableCell>
                    <TableCell>
                      {row.shiftCode} — {row.shiftName}
                    </TableCell>
                    <TableCell>{row.effectiveFrom}</TableCell>
                    <TableCell>{row.effectiveTo ?? "Open"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New shift template</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="STD-DAY" />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Standard day"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Start</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Break (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={480}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Timezone</Label>
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShiftOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || saveShiftM.isPending}
              onClick={() => saveShiftM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign shift</DialogTitle>
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
              <Label>Shift template</Label>
              <RecordLookupSelect value={shiftTemplateId} onValueChange={setShiftTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Effective to</Label>
                <Input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !shiftTemplateId || !effectiveFrom || saveAssignM.isPending}
              onClick={() => saveAssignM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
