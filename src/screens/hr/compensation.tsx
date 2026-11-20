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
import { HrPayrollHandoffPanel } from "@/components/hr/HrPayrollHandoffPanel";
import { listHrCompensationChanges, upsertHrCompensationChange } from "@/lib/hr/talent.functions";

export function HrCompensationPage() {
  const { company, isPending } = useActiveCompany();
  const canSensitive = useCanDo("hr.employees.sensitive");
  const qc = useQueryClient();
  const fetch = useServerFn(listHrCompensationChanges);
  const fetchEmployees = useServerFn(listHrEmployees);
  const save = useServerFn(upsertHrCompensationChange);
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState("proposed");
  const [notes, setNotes] = useState("");

  const dataQ = useQuery({
    queryKey: ["hr-comp", company?.id],
    queryFn: () => fetch({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSensitive,
    retry: false,
  });
  const empQ = useQuery({
    queryKey: ["hr-emp-comp", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && open,
    retry: false,
  });
  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            effectiveOn,
            changeType: "adjustment",
            currencyCode: company?.base_currency ?? "USD",
            proposedAmount: Number(amount) || 0,
            status,
            notes: notes.trim() || null,
            payrollHandoffNote: "Pending Payroll apply — HR must not mutate finalized pay runs.",
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Compensation proposal saved");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["hr-comp", company?.id] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canSensitive)
    return (
      <ListWorkspace
        title="Compensation & Benefits"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Compensation & Benefits" }]}
        subnav={<HrSubnav current="compensation" />}
      >
        <EmptyState title="No access" description="Missing permission: hr.employees.sensitive." />
      </ListWorkspace>
    );

  const items = dataQ.data?.items ?? [];
  const employees = empQ.data?.items ?? [];

  return (
    <ListWorkspace
      title="Compensation & Benefits"
      description="Proposed compensation changes for Payroll handoff. Finalized pay runs are never mutated from HR."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Compensation & Benefits" }]}
      actions={
        <Button
          type="button"
          onClick={() => {
            setEmployeeId("");
            setEffectiveOn(new Date().toISOString().slice(0, 10));
            setAmount("0");
            setStatus("proposed");
            setNotes("");
            setOpen(true);
          }}
        >
          Propose change
        </Button>
      }
      subnav={<HrSubnav current="compensation" />}
    >
      {dataQ.isPending ? (
        <LoadingState />
      ) : dataQ.isError ? (
        <QueryErrorState queries={[dataQ]} title="Could not load compensation" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No compensation proposals"
          description="Propose adjustments for Payroll to apply through approved handoff."
          action={
            <Button
              size="sm"
              type="button"
              onClick={() => {
                setEmployeeId("");
                setEffectiveOn(new Date().toISOString().slice(0, 10));
                setAmount("0");
                setStatus("proposed");
                setNotes("");
                setOpen(true);
              }}
            >
              Propose change
            </Button>
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.employeeName ?? "—"}</TableCell>
                  <TableCell>{r.effectiveOn}</TableCell>
                  <TableCell>
                    {r.currencyCode} {r.proposedAmount}
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
      <HrPayrollHandoffPanel companyId={company.id} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose compensation change</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              {empQ.isPending ? (
                <LoadingState />
              ) : empQ.isError ? (
                <QueryErrorState queries={[empQ]} title="Could not load employees" />
              ) : empQ.isSuccess ? (
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
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>Effective on</Label>
              <Input
                type="date"
                value={effectiveOn}
                onChange={(e) => setEffectiveOn(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Proposed amount</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <RecordLookupSelect value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["draft", "proposed", "approved", "rejected", "cancelled"].map((s) => (
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !effectiveOn || saveM.isPending || !empQ.isSuccess}
              onClick={() => saveM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
