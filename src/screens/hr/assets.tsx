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
  listHrAssetAssignments,
  listHrAssetTypes,
  upsertHrAssetAssignment,
  upsertHrAssetType,
} from "@/lib/hr/people.functions";
import { HR_ASSET_STATUSES } from "@/lib/hr/people-types";

export function HrAssetsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.employees.manage");
  const queryClient = useQueryClient();
  const fetchTypes = useServerFn(listHrAssetTypes);
  const fetchAssignments = useServerFn(listHrAssetAssignments);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveType = useServerFn(upsertHrAssetType);
  const saveAssignment = useServerFn(upsertHrAssetAssignment);

  const [typeOpen, setTypeOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [assetTypeId, setAssetTypeId] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [status, setStatus] = useState("assigned");

  const typesQ = useQuery({
    queryKey: ["hr-asset-types", company?.id],
    queryFn: () => fetchTypes({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const assignQ = useQuery({
    queryKey: ["hr-asset-assignments", company?.id],
    queryFn: () => fetchAssignments({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-assets", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && assignOpen,
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-asset-types", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-asset-assignments", company?.id] });
  };

  const typeM = useMutation({
    mutationFn: () =>
      saveType({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            code: code.trim(),
            name: name.trim(),
            isActive: true,
            sortOrder: 100,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Asset type saved");
      setTypeOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });
  const assignM = useMutation({
    mutationFn: () =>
      saveAssignment({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            assetTypeId,
            assetTag: assetTag.trim(),
            description: null,
            conditionOnIssue: "good",
            conditionOnReturn: null,
            status,
            assignedOn: new Date().toISOString().slice(0, 10),
            returnedOn: null,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Asset assigned");
      setAssignOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canView) {
    return (
      <ListWorkspace
        title="Employee Assets"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Assets" }]}
      subnav={<HrSubnav current="assets" />}
    >
        <EmptyState title="No access" description="You need hr.view to open assets." />
      </ListWorkspace>
    );
  }

  const types = typesQ.data?.items ?? [];
  const activeTypes = types.filter((t) => t.isActive);
  const assignments = assignQ.data?.items ?? [];
  const employees = employeesQ.data?.items ?? [];

  return (
    <ListWorkspace
      title="Employee Assets"
      description="Allocate equipment and track custody, condition and returns."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Assets" }]}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCode("");
                setName("");
                setTypeOpen(true);
              }}
            >
              New asset type
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEmployeeId("");
                setAssetTypeId(activeTypes[0]?.id ?? "");
                setAssetTag("");
                setStatus("assigned");
                setAssignOpen(true);
              }}
            >
              Assign asset
            </Button>
          </div>
        ) : undefined
      }
      subnav={<HrSubnav current="assets" />}
    >
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Asset types
        </h2>
        {typesQ.isPending ? (
          <LoadingState />
        ) : typesQ.isError ? (
          <ErrorState
            title="Could not load asset types"
            description={friendlyAuthError(typesQ.error)}
            onRetry={() => void typesQ.refetch()}
          />
        ) : types.length === 0 ? (
          <EmptyState
            title="No asset types"
            description="Create laptop, phone or badge types before assigning custody."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
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
        {assignQ.isPending ? (
          <LoadingState />
        ) : assignments.length === 0 ? (
          <EmptyState
            title="No assignments"
            description="Assign an asset tag to an employee to start custody tracking."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.assetTag}</TableCell>
                    <TableCell>{row.assetTypeCode}</TableCell>
                    <TableCell>{row.employeeName ?? "—"}</TableCell>
                    <TableCell>{row.assignedOn}</TableCell>
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

      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New asset type</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LAPTOP" />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptop" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTypeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || typeM.isPending}
              onClick={() => typeM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign asset</DialogTitle>
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
              <Label>Asset type</Label>
              <RecordLookupSelect value={assetTypeId} onValueChange={setAssetTypeId}>
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
            <div className="grid gap-1.5">
              <Label>Asset tag</Label>
              <Input
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="LB-001"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <RecordLookupSelect value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_ASSET_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !assetTypeId || !assetTag.trim() || assignM.isPending}
              onClick={() => assignM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
