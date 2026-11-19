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
  decideHrLeaveRequest,
  ensureHrLeaveBalance,
  listHrLeaveBalances,
  listHrLeaveRequests,
  listHrLeaveTypes,
  upsertHrLeaveRequest,
  upsertHrLeaveType,
} from "@/lib/hr/time.functions";
import { HR_LEAVE_ACCRUAL_METHODS, HR_LEAVE_REQUEST_STATUSES } from "@/lib/hr/time-types";
import { RecordDiscussButton } from "@/components/messaging/RecordDiscussButton";

export function HrLeavePage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.leave.manage");
  const canApprove = useCanDo("hr.leave.approve") || canManage;
  const queryClient = useQueryClient();

  const fetchTypes = useServerFn(listHrLeaveTypes);
  const fetchBalances = useServerFn(listHrLeaveBalances);
  const fetchRequests = useServerFn(listHrLeaveRequests);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveType = useServerFn(upsertHrLeaveType);
  const saveRequest = useServerFn(upsertHrLeaveRequest);
  const decideRequest = useServerFn(decideHrLeaveRequest);
  const ensureBalance = useServerFn(ensureHrLeaveBalance);

  const [typeOpen, setTypeOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [balOpen, setBalOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [allowance, setAllowance] = useState(20);
  const [accrual, setAccrual] = useState("annual");
  const [requiresApproval, setRequiresApproval] = useState("yes");
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("submitted");
  const [reason, setReason] = useState("");

  const typesQ = useQuery({
    queryKey: ["hr-leave-types", company?.id],
    queryFn: () => fetchTypes({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const balancesQ = useQuery({
    queryKey: ["hr-leave-balances", company?.id],
    queryFn: () => fetchBalances({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const requestsQ = useQuery({
    queryKey: ["hr-leave-requests", company?.id],
    queryFn: () => fetchRequests({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-leave", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && (reqOpen || balOpen),
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-leave-types", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-leave-balances", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-leave-requests", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-dashboard", company?.id] });
  };

  const saveTypeM = useMutation({
    mutationFn: () =>
      saveType({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            code: code.trim(),
            name: name.trim(),
            isPaid: true,
            requiresApproval: requiresApproval === "yes",
            annualAllowanceDays: allowance,
            accrualMethod: accrual,
            isActive: true,
            sortOrder: 100,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Leave type saved");
      setTypeOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const saveReqM = useMutation({
    mutationFn: () =>
      saveRequest({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            leaveTypeId,
            startDate,
            endDate,
            days: null,
            status,
            reason: reason.trim() || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Leave request saved");
      setReqOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const ensureBalM = useMutation({
    mutationFn: () =>
      ensureBalance({
        data: {
          companyId: company!.id,
          employeeId,
          leaveTypeId,
          year: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Leave balance ensured");
      setBalOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const decideM = useMutation({
    mutationFn: (input: { requestId: string; decision: "approved" | "rejected" | "cancelled" }) =>
      decideRequest({
        data: {
          companyId: company!.id,
          requestId: input.requestId,
          decision: input.decision,
          decisionNotes: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Leave request decided");
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
        title="Leave Management"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Leave Management" }]}
        subnav={<HrSubnav current="leave" />}
      >
        <EmptyState title="No access" description="You need hr.view to open leave." />
      </ListWorkspace>
    );
  }

  const types = typesQ.data?.items ?? [];
  const balances = balancesQ.data?.items ?? [];
  const requests = requestsQ.data?.items ?? [];
  const employees = employeesQ.data?.items ?? [];
  const activeTypes = types.filter((t) => t.isActive);

  return (
    <ListWorkspace
      title="Leave Management"
      description="Policies, balances, requests, and approvals with database-enforced availability."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Leave Management" }]}
      actions={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setBalOpen(true)}>
              Ensure balance
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEmployeeId("");
                setLeaveTypeId(activeTypes[0]?.id ?? "");
                setStartDate("");
                setEndDate("");
                setStatus("submitted");
                setReason("");
                setReqOpen(true);
              }}
            >
              New request
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCode("");
                setName("");
                setAllowance(20);
                setAccrual("annual");
                setRequiresApproval("yes");
                setTypeOpen(true);
              }}
            >
              New leave type
            </Button>
          </div>
        ) : undefined
      }
      subnav={<HrSubnav current="leave" />}
    >
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Leave types
        </h2>
        {typesQ.isPending ? (
          <LoadingState />
        ) : typesQ.isError ? (
          <QueryErrorState queries={[typesQ]} title="Could not load leave types" />
        ) : types.length === 0 ? (
          <EmptyState
            title="No leave types"
            description="Create annual, sick, or unpaid leave policies before recording balances."
            action={
              canManage ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    setCode("");
                    setName("");
                    setAllowance(20);
                    setAccrual("annual");
                    setRequiresApproval("yes");
                    setTypeOpen(true);
                  }}
                >
                  New leave type
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
                  <TableHead>Allowance</TableHead>
                  <TableHead>Accrual</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.annualAllowanceDays}</TableCell>
                    <TableCell>{row.accrualMethod}</TableCell>
                    <TableCell>{row.requiresApproval ? "Required" : "Auto"}</TableCell>
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

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Balances ({balancesQ.data?.year ?? new Date().getFullYear()})
        </h2>
        {balancesQ.isPending ? (
          <LoadingState />
        ) : balances.length === 0 ? (
          <EmptyState
            title="No balances yet"
            description="Ensure a balance for an employee and leave type to seed entitlement."
            action={
              canManage ? (
                <Button size="sm" type="button" onClick={() => setBalOpen(true)}>
                  Ensure balance
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
                  <TableHead>Type</TableHead>
                  <TableHead>Entitled</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.employeeName ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">{row.employeeNumber}</div>
                    </TableCell>
                    <TableCell>
                      {row.leaveTypeCode} — {row.leaveTypeName}
                    </TableCell>
                    <TableCell>{row.entitledDays}</TableCell>
                    <TableCell>{row.pendingDays}</TableCell>
                    <TableCell>{row.usedDays}</TableCell>
                    <TableCell className="font-medium">{row.availableDays}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Requests
        </h2>
        {requestsQ.isPending ? (
          <LoadingState />
        ) : requests.length === 0 ? (
          <EmptyState
            title="No leave requests"
            description="Submitted requests reserve pending balance until approved or rejected."
            action={
              canManage && activeTypes.length > 0 ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    setEmployeeId("");
                    setLeaveTypeId(activeTypes[0]?.id ?? "");
                    setStartDate("");
                    setEndDate("");
                    setStatus("submitted");
                    setReason("");
                    setReqOpen(true);
                  }}
                >
                  New request
                </Button>
              ) : canManage ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCode("");
                    setName("");
                    setAllowance(20);
                    setAccrual("annual");
                    setRequiresApproval("yes");
                    setTypeOpen(true);
                  }}
                >
                  New leave type first
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.requestNumber}</TableCell>
                    <TableCell>{row.employeeName ?? "—"}</TableCell>
                    <TableCell>{row.leaveTypeCode}</TableCell>
                    <TableCell>
                      {row.startDate} → {row.endDate}
                    </TableCell>
                    <TableCell>{row.days}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <RecordDiscussButton
                        companyId={company?.id ?? null}
                        recordType="hr_leave_request"
                        recordId={row.id}
                        title={`Leave ${row.requestNumber}`}
                        visibility="hr_private"
                        label="Discuss"
                      />
                      {canApprove && row.status === "submitted" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={decideM.isPending}
                            onClick={() =>
                              decideM.mutate({ requestId: row.id, decision: "approved" })
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
                              decideM.mutate({ requestId: row.id, decision: "rejected" })
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

      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New leave type</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AL" />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Annual leave"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Annual allowance (days)</Label>
              <Input
                type="number"
                min={0}
                max={366}
                value={allowance}
                onChange={(e) => setAllowance(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Accrual method</Label>
              <RecordLookupSelect value={accrual} onValueChange={setAccrual}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_LEAVE_ACCRUAL_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Requires approval</Label>
              <Select value={requiresApproval} onValueChange={setRequiresApproval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No (auto-approve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTypeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || saveTypeM.isPending}
              onClick={() => saveTypeM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New leave request</DialogTitle>
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
              <Label>Leave type</Label>
              <RecordLookupSelect value={leaveTypeId} onValueChange={setLeaveTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>End</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <RecordLookupSelect value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_LEAVE_REQUEST_STATUSES.filter(
                    (s) => s === "draft" || s === "submitted" || s === "cancelled",
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
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
            <Button type="button" variant="outline" onClick={() => setReqOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !leaveTypeId || !startDate || !endDate || saveReqM.isPending}
              onClick={() => saveReqM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={balOpen} onOpenChange={setBalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ensure leave balance</DialogTitle>
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
              <Label>Leave type</Label>
              <RecordLookupSelect value={leaveTypeId} onValueChange={setLeaveTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !leaveTypeId || ensureBalM.isPending}
              onClick={() => ensureBalM.mutate()}
            >
              Ensure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
