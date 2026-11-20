import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { getHrEmployee, listHrOrgUnits, upsertHrEmployeeProfile } from "@/lib/hr/hr.functions";
import { HR_WORK_ARRANGEMENTS } from "@/lib/hr/types";

type ProfileDraft = {
  preferredName: string;
  legalMiddleName: string;
  personalEmail: string;
  personalPhone: string;
  workPhone: string;
  managerEmployeeId: string;
  departmentId: string;
  designationId: string;
  locationId: string;
  branchId: string;
  workArrangement: string;
  probationEndDate: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  notes: string;
  version: number | null;
};

const emptyDraft = (): ProfileDraft => ({
  preferredName: "",
  legalMiddleName: "",
  personalEmail: "",
  personalPhone: "",
  workPhone: "",
  managerEmployeeId: "",
  departmentId: "",
  designationId: "",
  locationId: "",
  branchId: "",
  workArrangement: "onsite",
  probationEndDate: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  notes: "",
  version: null,
});

export function HrEmployeeDetailPage({ employeeId }: { employeeId: string }) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.employees.manage");
  const queryClient = useQueryClient();
  const fetchEmployee = useServerFn(getHrEmployee);
  const fetchOrg = useServerFn(listHrOrgUnits);
  const saveProfile = useServerFn(upsertHrEmployeeProfile);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft());

  const detailQ = useQuery({
    queryKey: ["hr-employee", company?.id, employeeId],
    queryFn: () => fetchEmployee({ data: { companyId: company!.id, employeeId } }),
    enabled: Boolean(company?.id) && canView && Boolean(employeeId),
    retry: false,
  });

  const orgQ = useQuery({
    queryKey: ["hr-org-units", company?.id],
    queryFn: () => fetchOrg({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  useEffect(() => {
    if (!detailQ.isSuccess || !detailQ.data) return;
    const profile = detailQ.data.profile;
    setDraft({
      preferredName: profile?.preferredName ?? "",
      legalMiddleName: profile?.legalMiddleName ?? "",
      personalEmail: profile?.personalEmail ?? "",
      personalPhone: profile?.personalPhone ?? "",
      workPhone: profile?.workPhone ?? "",
      managerEmployeeId: profile?.managerEmployeeId ?? "",
      departmentId: profile?.departmentId ?? "",
      designationId: profile?.designationId ?? "",
      locationId: profile?.locationId ?? "",
      branchId: profile?.branchId ?? "",
      workArrangement: profile?.workArrangement ?? "onsite",
      probationEndDate: profile?.probationEndDate ?? "",
      emergencyContactName: profile?.emergencyContactName ?? "",
      emergencyContactPhone: profile?.emergencyContactPhone ?? "",
      emergencyContactRelation: profile?.emergencyContactRelation ?? "",
      notes: profile?.notes ?? "",
      version: profile?.version ?? null,
    });
  }, [detailQ.isSuccess, detailQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          companyId: company!.id,
          employeeId,
          payload: {
            preferredName: draft.preferredName,
            legalMiddleName: draft.legalMiddleName,
            personalEmail: draft.personalEmail,
            personalPhone: draft.personalPhone,
            workPhone: draft.workPhone,
            managerEmployeeId: draft.managerEmployeeId || null,
            departmentId: draft.departmentId || null,
            designationId: draft.designationId || null,
            locationId: draft.locationId || null,
            branchId: draft.branchId || null,
            workArrangement: draft.workArrangement,
            probationEndDate: draft.probationEndDate || null,
            emergencyContactName: draft.emergencyContactName,
            emergencyContactPhone: draft.emergencyContactPhone,
            emergencyContactRelation: draft.emergencyContactRelation,
            notes: draft.notes,
            version: draft.version ?? null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("HR profile saved");
      await queryClient.invalidateQueries({ queryKey: ["hr-employee", company?.id, employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["hr-employees", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["hr-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <RecordWorkspace title="Employee" description="HR profile">
        <EmptyState title="No HR access" description="Ask an administrator for hr.view." />
      </RecordWorkspace>
    );
  }
  if (detailQ.isPending) return <LoadingState />;
  if (detailQ.isError) {
    return (
      <RecordWorkspace title="Employee" description="HR profile">
        <QueryErrorState queries={[detailQ]} title="Could not load employee" />
      </RecordWorkspace>
    );
  }
  if (!detailQ.isSuccess) return <LoadingState />;
  if (!detailQ.data) {
    return (
      <RecordWorkspace title="Employee" description="HR profile">
        <EmptyState
          title="Employee not found"
          description="Return to the directory and try again."
        />
      </RecordWorkspace>
    );
  }
  if (orgQ.isError) {
    return (
      <RecordWorkspace title="Employee" description="HR profile">
        <QueryErrorState queries={[orgQ]} title="Could not load organisation structure" />
      </RecordWorkspace>
    );
  }

  const emp = detailQ.data.employee;
  const title = `${emp.firstName} ${emp.lastName}`;

  return (
    <RecordWorkspace
      title={title}
      description={`Employee ${emp.employeeNumber} · shared with Payroll`}
      breadcrumbs={[
        { label: "HR", to: "/hr" },
        { label: "Employees", to: "/hr/employees" },
        { label: emp.employeeNumber },
      ]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/payroll/employees/$employeeId" params={{ employeeId: emp.id }}>
              Open in Payroll
            </Link>
          </Button>
          {canManage ? (
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !orgQ.isSuccess}
            >
              {saveMut.isPending ? "Saving…" : "Save HR profile"}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={emp.status} />
        <span className="text-sm text-muted-foreground">
          Hired {emp.hireDate}
          {emp.terminationDate ? ` · Terminated ${emp.terminationDate}` : ""}
        </span>
      </div>

      <Alert className="mb-6">
        <AlertTitle>Canonical identity</AlertTitle>
        <AlertDescription>
          Legal name, employment status, hire/termination and pay setup are owned with Payroll on
          this same employee record. HR stores organisation, manager and emergency contact facts.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Employment (Payroll)
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd>{emp.employmentType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{emp.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pay country</dt>
              <dd>{emp.payrollCountryCode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Currency</dt>
              <dd>{emp.payrollCurrency}</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            HR profile
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="preferredName">Preferred name</Label>
              <Input
                id="preferredName"
                value={draft.preferredName}
                disabled={!canManage}
                onChange={(e) => setDraft((d) => ({ ...d, preferredName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workArrangement">Work arrangement</Label>
              <RecordLookupSelect
                value={draft.workArrangement}
                disabled={!canManage}
                onValueChange={(value) => setDraft((d) => ({ ...d, workArrangement: value }))}
              >
                <SelectTrigger id="workArrangement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_WORK_ARRANGEMENTS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="departmentId">Department</Label>
              <RecordLookupSelect
                value={draft.departmentId || "__none"}
                disabled={!canManage}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, departmentId: value === "__none" ? "" : value }))
                }
              >
                <SelectTrigger id="departmentId">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {(orgQ.data?.departments ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="designationId">Designation</Label>
              <RecordLookupSelect
                value={draft.designationId || "__none"}
                disabled={!canManage}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, designationId: value === "__none" ? "" : value }))
                }
              >
                <SelectTrigger id="designationId">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {(orgQ.data?.designations ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="locationId">Location</Label>
              <RecordLookupSelect
                value={draft.locationId || "__none"}
                disabled={!canManage}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, locationId: value === "__none" ? "" : value }))
                }
              >
                <SelectTrigger id="locationId">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {(orgQ.data?.locations ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="probationEndDate">Probation end</Label>
              <Input
                id="probationEndDate"
                type="date"
                value={draft.probationEndDate}
                disabled={!canManage}
                onChange={(e) => setDraft((d) => ({ ...d, probationEndDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emergencyContactName">Emergency contact</Label>
              <Input
                id="emergencyContactName"
                value={draft.emergencyContactName}
                disabled={!canManage}
                onChange={(e) => setDraft((d) => ({ ...d, emergencyContactName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emergencyContactPhone">Emergency phone</Label>
              <Input
                id="emergencyContactPhone"
                value={draft.emergencyContactPhone}
                disabled={!canManage}
                onChange={(e) => setDraft((d) => ({ ...d, emergencyContactPhone: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={draft.notes}
                disabled={!canManage}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Position history
        </h2>
        {!detailQ.data.positionHistory.length ? (
          <p className="text-sm text-muted-foreground">
            No effective-dated HR position history yet. Saving a profile creates the first entry.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailQ.data.positionHistory.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.effectiveFrom}</TableCell>
                  <TableCell>{row.effectiveTo ?? "Current"}</TableCell>
                  <TableCell>{row.changeType}</TableCell>
                  <TableCell>{row.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </RecordWorkspace>
  );
}
