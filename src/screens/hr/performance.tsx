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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrEmployees } from "@/lib/hr/hr.functions";
import {
  listHrPerformanceCycles,
  listHrPerformanceGoals,
  upsertHrPerformanceCycle,
  upsertHrPerformanceGoal,
} from "@/lib/hr/talent.functions";

export function HrPerformancePage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.performance.manage");
  const qc = useQueryClient();
  const fetchCycles = useServerFn(listHrPerformanceCycles);
  const fetchGoals = useServerFn(listHrPerformanceGoals);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveCycle = useServerFn(upsertHrPerformanceCycle);
  const saveGoal = useServerFn(upsertHrPerformanceGoal);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [title, setTitle] = useState("");

  const cyclesQ = useQuery({
    queryKey: ["hr-perf-cycles", company?.id],
    queryFn: () => fetchCycles({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const goalsQ = useQuery({
    queryKey: ["hr-perf-goals", company?.id],
    queryFn: () => fetchGoals({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const empQ = useQuery({
    queryKey: ["hr-emp-perf", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && goalOpen,
    retry: false,
  });

  const inv = async () => {
    await qc.invalidateQueries({ queryKey: ["hr-perf-cycles", company?.id] });
    await qc.invalidateQueries({ queryKey: ["hr-perf-goals", company?.id] });
  };
  const cycleM = useMutation({
    mutationFn: () =>
      saveCycle({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            code: code.trim(),
            name: name.trim(),
            startsOn,
            endsOn,
            status: "open",
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Cycle saved");
      setCycleOpen(false);
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const goalM = useMutation({
    mutationFn: () =>
      saveGoal({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            cycleId,
            employeeId,
            title: title.trim(),
            status: "active",
            targetValue: null,
            currentValue: null,
            weightPercent: 0,
            dueOn: null,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Goal saved");
      setGoalOpen(false);
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
        title="Performance"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Performance" }]}
      >
        <HrSubnav current="performance" />
        <EmptyState title="No access" description="You need hr.view." />
      </ListWorkspace>
    );

  const cycles = cyclesQ.data?.items ?? [];
  const goals = goalsQ.data?.items ?? [];
  const employees = empQ.data?.items ?? [];

  return (
    <ListWorkspace
      title="Performance"
      description="Review cycles, goals and appraisals."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Performance" }]}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCode("");
                setName("");
                setStartsOn("");
                setEndsOn("");
                setCycleOpen(true);
              }}
            >
              New cycle
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCycleId(cycles[0]?.id ?? "");
                setEmployeeId("");
                setTitle("");
                setGoalOpen(true);
              }}
            >
              Add goal
            </Button>
          </div>
        ) : undefined
      }
    >
      <HrSubnav current="performance" />
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cycles
        </h2>
        {cyclesQ.isPending ? (
          <LoadingState />
        ) : cyclesQ.isError ? (
          <ErrorState
            title="Could not load cycles"
            description={friendlyAuthError(cyclesQ.error)}
            onRetry={() => void cyclesQ.refetch()}
          />
        ) : cycles.length === 0 ? (
          <EmptyState title="No cycles" description="Create an open review cycle first." />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>
                      {r.startsOn} → {r.endsOn}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
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
          Goals
        </h2>
        {goalsQ.isPending ? (
          <LoadingState />
        ) : goals.length === 0 ? (
          <EmptyState title="No goals" description="Add goals against an open cycle." />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.employeeName ?? "—"}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>{r.weightPercent}%</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>
      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New performance cycle</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Starts</Label>
                <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Ends</Label>
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCycleOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || !startsOn || !endsOn || cycleM.isPending}
              onClick={() => cycleM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add goal</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Cycle</Label>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select cycle" />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
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
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGoalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!cycleId || !employeeId || !title.trim() || goalM.isPending}
              onClick={() => goalM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
