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
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrEmployees, listHrOrgUnits } from "@/lib/hr/hr.functions";
import {
  decideHrTransferRequest,
  listHrTransferRequests,
  upsertHrTransferRequest,
} from "@/lib/hr/lifecycle-move.functions";
import { HR_TRANSFER_CHANGE_TYPES } from "@/lib/hr/lifecycle-move-types";

export function HrTransfersPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.employees.manage");
  const qc = useQueryClient();
  const fetch = useServerFn(listHrTransferRequests);
  const fetchEmployees = useServerFn(listHrEmployees);
  const fetchOrg = useServerFn(listHrOrgUnits);
  const save = useServerFn(upsertHrTransferRequest);
  const decide = useServerFn(decideHrTransferRequest);
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [changeType, setChangeType] = useState("transfer");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [toDepartmentId, setToDepartmentId] = useState("");
  const [toDesignationId, setToDesignationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [toManagerEmployeeId, setToManagerEmployeeId] = useState("");
  const [reason, setReason] = useState("");

  const listQ = useQuery({
    queryKey: ["hr-transfers", company?.id],
    queryFn: () => fetch({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const empQ = useQuery({
    queryKey: ["hr-emp-xfer", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && open,
    retry: false,
  });
  const orgQ = useQuery({
    queryKey: ["hr-org-xfer", company?.id],
    queryFn: () => fetchOrg({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && open,
    retry: false,
  });

  const inv = async () => {
    await qc.invalidateQueries({ queryKey: ["hr-transfers", company?.id] });
  };
  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            changeType,
            effectiveOn,
            status: "submitted",
            toDepartmentId: toDepartmentId || null,
            toDesignationId: toDesignationId || null,
            toLocationId: toLocationId || null,
            toBranchId: null,
            toManagerEmployeeId: toManagerEmployeeId || null,
            toWorkArrangement: null,
            reason: reason.trim() || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Transfer submitted");
      setOpen(false);
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const decideM = useMutation({
    mutationFn: (args: { requestId: string; decision: "approve" | "reject" | "cancel" }) =>
      decide({
        data: {
          companyId: company!.id,
          requestId: args.requestId,
          decision: args.decision,
          rejectionReason: args.decision === "reject" ? "Rejected by HR" : null,
        },
      }),
    onSuccess: async (res) => {
      toast.success(`Transfer ${res.status}`);
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
        title="Transfers & Promotions"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Transfers & Promotions" }]}
      subnav={<HrSubnav current="transfers" />}
    >
        <EmptyState title="No access" description="You need hr.view." />
      </ListWorkspace>
    );

  const items = listQ.data?.items ?? [];
  const employees = empQ.data?.items ?? [];
  const departments = orgQ.data?.departments ?? [];
  const designations = orgQ.data?.designations ?? [];
  const locations = orgQ.data?.locations ?? [];

  return (
    <ListWorkspace
      title="Transfers & Promotions"
      description="Effective-dated role, department, manager and location changes with position history."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Transfers & Promotions" }]}
      actions={
        canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEmployeeId("");
              setChangeType("transfer");
              setEffectiveOn(new Date().toISOString().slice(0, 10));
              setToDepartmentId("");
              setToDesignationId("");
              setToLocationId("");
              setToManagerEmployeeId("");
              setReason("");
              setOpen(true);
            }}
          >
            New request
          </Button>
        ) : undefined
      }
      subnav={<HrSubnav current="transfers" />}
    >
      {listQ.isPending ? (
        <LoadingState />
      ) : listQ.isError ? (
        <ErrorState
          title="Could not load transfers"
          description={friendlyAuthError(listQ.error)}
          onRetry={() => void listQ.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No transfer requests"
          description="Submit a transfer or promotion with an effective date."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.requestNumber}</TableCell>
                  <TableCell>{r.employeeName ?? "—"}</TableCell>
                  <TableCell>{r.changeType}</TableCell>
                  <TableCell>{r.effectiveOn}</TableCell>
                  <TableCell>
                    {[r.toDepartmentName, r.toDesignationName, r.toLocationName]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (r.status === "draft" || r.status === "submitted") ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={decideM.isPending}
                          onClick={() => decideM.mutate({ requestId: r.id, decision: "approve" })}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={decideM.isPending}
                          onClick={() => decideM.mutate({ requestId: r.id, decision: "reject" })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New transfer / promotion</DialogTitle>
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
              <Label>Change type</Label>
              <RecordLookupSelect value={changeType} onValueChange={setChangeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_TRANSFER_CHANGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
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
              <Label>To department</Label>
              <RecordLookupSelect value={toDepartmentId} onValueChange={setToDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>To designation</Label>
              <RecordLookupSelect value={toDesignationId} onValueChange={setToDesignationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {designations.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>To location</Label>
              <RecordLookupSelect value={toLocationId} onValueChange={setToLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>To manager</Label>
              <RecordLookupSelect
                value={toManagerEmployeeId}
                onValueChange={setToManagerEmployeeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !effectiveOn || saveM.isPending}
              onClick={() => saveM.mutate()}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
