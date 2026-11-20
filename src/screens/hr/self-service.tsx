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
import { listHrLeaveTypes } from "@/lib/hr/time.functions";
import {
  clockHrSelfAttendance,
  createHrSelfLeaveRequest,
  getHrSelfContext,
  listHrSelfAttendance,
  listHrSelfLeaveRequests,
  updateHrSelfProfile,
} from "@/lib/hr/workspace.functions";

export function HrSelfServicePage() {
  const { company, isPending } = useActiveCompany();
  const canSelf = useCanDo("hr.self_service");
  const queryClient = useQueryClient();

  const fetchContext = useServerFn(getHrSelfContext);
  const fetchLeave = useServerFn(listHrSelfLeaveRequests);
  const fetchAttendance = useServerFn(listHrSelfAttendance);
  const fetchTypes = useServerFn(listHrLeaveTypes);
  const saveProfile = useServerFn(updateHrSelfProfile);
  const createLeave = useServerFn(createHrSelfLeaveRequest);
  const clock = useServerFn(clockHrSelfAttendance);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [personalPhone, setPersonalPhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  const contextQ = useQuery({
    queryKey: ["hr-self-context", company?.id],
    queryFn: () => fetchContext({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSelf,
    retry: false,
  });

  const leaveQ = useQuery({
    queryKey: ["hr-self-leave", company?.id],
    queryFn: () => fetchLeave({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSelf && Boolean(contextQ.data?.linked),
    retry: false,
  });

  const attendanceQ = useQuery({
    queryKey: ["hr-self-attendance", company?.id],
    queryFn: () => fetchAttendance({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSelf && Boolean(contextQ.data?.linked),
    retry: false,
  });

  const typesQ = useQuery({
    queryKey: ["hr-leave-types-self", company?.id],
    queryFn: () => fetchTypes({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && leaveOpen,
    retry: false,
  });

  // Sync editable profile fields when context loads
  const profile = contextQ.data?.profile;
  if (profile && preferredName === "" && personalEmail === "" && !contextQ.isFetching) {
    // one-shot hydrate without effect: only when still empty
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-self-context", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-self-leave", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-self-attendance", company?.id] });
  };

  const saveProfileM = useMutation({
    mutationFn: () => {
      const current = contextQ.data?.profile;
      return saveProfile({
        data: {
          companyId: company!.id,
          payload: {
            preferredName: preferredName.trim() || current?.preferredName || null,
            personalEmail: personalEmail.trim() || current?.personalEmail || null,
            personalPhone: personalPhone.trim() || current?.personalPhone || null,
            workPhone: current?.workPhone ?? null,
            emergencyContactName: emergencyName.trim() || current?.emergencyContactName || null,
            emergencyContactPhone: emergencyPhone.trim() || current?.emergencyContactPhone || null,
            emergencyContactRelation: current?.emergencyContactRelation ?? null,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Profile updated");
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const leaveM = useMutation({
    mutationFn: () =>
      createLeave({
        data: {
          companyId: company!.id,
          payload: {
            leaveTypeId,
            startDate,
            endDate,
            days: null,
            status: "submitted",
            reason: reason.trim() || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Leave request submitted");
      setLeaveOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const clockM = useMutation({
    mutationFn: (action: "check_in" | "check_out") =>
      clock({
        data: { companyId: company!.id, action, workDate: null, notes: null },
      }),
    onSuccess: async (_data, action) => {
      toast.success(action === "check_in" ? "Checked in" : "Checked out");
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canSelf) {
    return (
      <ListWorkspace
        title="Employee Self-Service"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Self-Service" }]}
        subnav={<HrSubnav current="self-service" />}
      >
        <EmptyState title="No access" description="You need hr.self_service permission." />
      </ListWorkspace>
    );
  }

  if (contextQ.isPending) return <LoadingState />;
  if (contextQ.isError) {
    return (
      <ListWorkspace
        title="Employee Self-Service"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Self-Service" }]}
        subnav={<HrSubnav current="self-service" />}
      >
        <QueryErrorState queries={[contextQ]} title="Could not load self-service" />
      </ListWorkspace>
    );
  }
  if (!contextQ.isSuccess || !contextQ.data) return null;

  const ctx = contextQ.data;
  const types = typesQ.isSuccess
    ? (typesQ.data?.items?.filter((t) => t.isActive) ?? [])
    : [];

  return (
    <ListWorkspace
      title="Employee Self-Service"
      description="Your profile, leave requests, and attendance punches."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Self-Service" }]}
      actions={
        ctx.linked ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={clockM.isPending}
              onClick={() => clockM.mutate("check_in")}
            >
              Check in
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={clockM.isPending}
              onClick={() => clockM.mutate("check_out")}
            >
              Check out
            </Button>
            <Button
              type="button"
              onClick={() => {
                setLeaveTypeId(types[0]?.id ?? "");
                setStartDate("");
                setEndDate("");
                setReason("");
                setLeaveOpen(true);
              }}
            >
              Request leave
            </Button>
          </div>
        ) : undefined
      }
      subnav={<HrSubnav current="self-service" />}
    >
      {!ctx.linked ? (
        <EmptyState
          title="Account not linked"
          description={
            ctx.message ??
            "Ask HR to link your login to an employee profile before using self-service."
          }
        />
      ) : (
        <>
          <section className="mb-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              My profile
            </h2>
            <div className="rounded-xl border border-border/90 bg-card p-4 shadow-card">
              <p className="mb-4 text-sm">
                <span className="font-medium">
                  {ctx.employee?.firstName} {ctx.employee?.lastName}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {ctx.employee?.employeeNumber} · {ctx.employee?.status}
                </span>
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Preferred name</Label>
                  <Input
                    defaultValue={ctx.profile?.preferredName ?? ""}
                    onChange={(e) => setPreferredName(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Personal email</Label>
                  <Input
                    defaultValue={ctx.profile?.personalEmail ?? ""}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Personal phone</Label>
                  <Input
                    defaultValue={ctx.profile?.personalPhone ?? ""}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Emergency contact</Label>
                  <Input
                    defaultValue={ctx.profile?.emergencyContactName ?? ""}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Emergency phone</Label>
                  <Input
                    defaultValue={ctx.profile?.emergencyContactPhone ?? ""}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  disabled={saveProfileM.isPending}
                  onClick={() => saveProfileM.mutate()}
                >
                  Save profile
                </Button>
              </div>
            </div>
          </section>

          <section className="mb-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              My leave
            </h2>
            {leaveQ.isPending ? (
              <LoadingState />
            ) : leaveQ.isError ? (
              <QueryErrorState queries={[leaveQ]} title="Could not load leave requests" />
            ) : !leaveQ.isSuccess ? null : (leaveQ.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No leave requests"
                description="Submit a leave request when needed."
                action={
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setLeaveTypeId(types[0]?.id ?? "");
                      setStartDate("");
                      setEndDate("");
                      setReason("");
                      setLeaveOpen(true);
                    }}
                  >
                    Request leave
                  </Button>
                }
              />
            ) : (
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveQ.data!.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.requestNumber}</TableCell>
                        <TableCell>{row.leaveTypeCode}</TableCell>
                        <TableCell>
                          {row.startDate} → {row.endDate}
                        </TableCell>
                        <TableCell>{row.days}</TableCell>
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
              My attendance
            </h2>
            {attendanceQ.isPending ? (
              <LoadingState />
            ) : attendanceQ.isError ? (
              <QueryErrorState queries={[attendanceQ]} title="Could not load attendance" />
            ) : !attendanceQ.isSuccess ? null : (attendanceQ.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No attendance yet"
                description="Use Check in / Check out above."
                action={
                  <Button
                    size="sm"
                    type="button"
                    disabled={clockM.isPending}
                    onClick={() => clockM.mutate("check_in")}
                  >
                    Check in
                  </Button>
                }
              />
            ) : (
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceQ.data!.items.map((row) => (
                      <TableRow key={row.id}>
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
          </section>
        </>
      )}

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Leave type</Label>
              {typesQ.isPending ? (
                <LoadingState />
              ) : typesQ.isError ? (
                <QueryErrorState queries={[typesQ]} title="Could not load leave types" />
              ) : typesQ.isSuccess ? (
                <RecordLookupSelect value={leaveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              ) : null}
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
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !leaveTypeId ||
                !startDate ||
                !endDate ||
                leaveM.isPending ||
                !typesQ.isSuccess
              }
              onClick={() => leaveM.mutate()}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
