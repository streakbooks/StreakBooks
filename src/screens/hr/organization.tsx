import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
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
import { listHrOrgUnits, upsertHrOrgUnit } from "@/lib/hr/hr.functions";

type OrgKind = "location" | "branch" | "department" | "designation";

export function HrOrganizationPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.organization.manage");
  const queryClient = useQueryClient();
  const fetchOrg = useServerFn(listHrOrgUnits);
  const saveUnit = useServerFn(upsertHrOrgUnit);
  const [kind, setKind] = useState<OrgKind>("department");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [gradeCode, setGradeCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [locationId, setLocationId] = useState("");

  const orgQ = useQuery({
    queryKey: ["hr-org-units", company?.id],
    queryFn: () => fetchOrg({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      saveUnit({
        data: {
          companyId: company!.id,
          kind,
          payload: {
            code,
            name,
            isActive: true,
            sortOrder: 100,
            ...(kind === "location" ? { timezone } : {}),
            ...(kind === "designation" ? { gradeCode } : {}),
            ...(kind === "department" ? { parentId: parentId || null } : {}),
            ...(kind === "branch" ? { locationId: locationId || null } : {}),
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Organisation unit saved");
      setOpen(false);
      setCode("");
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["hr-org-units", company?.id] });
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
      <ListWorkspace title="Organization" description="Structure">
        <EmptyState title="No HR access" description="Ask an administrator for hr.view." />
      </ListWorkspace>
    );
  }

  const rows =
    kind === "location"
      ? (orgQ.data?.locations ?? [])
      : kind === "branch"
        ? (orgQ.data?.branches ?? [])
        : kind === "department"
          ? (orgQ.data?.departments ?? [])
          : (orgQ.data?.designations ?? []);

  return (
    <ListWorkspace
      title="Organization"
      description="Locations, branches, departments and designations for multi-location workforces."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Organization" }]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setOpen(true)}>
            Add {kind}
          </Button>
        ) : undefined
      }
      subnav={<HrSubnav current="organization" />}
    >

      <div className="mb-4">
        <Select value={kind} onValueChange={(value) => setKind(value as OrgKind)}>
          <SelectTrigger className="w-[220px]" aria-label="Organisation unit type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="department">Departments</SelectItem>
            <SelectItem value="designation">Designations</SelectItem>
            <SelectItem value="location">Locations</SelectItem>
            <SelectItem value="branch">Branches</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {orgQ.isPending ? (
        <LoadingState />
      ) : orgQ.isError ? (
        <ErrorState
          title="Could not load organisation"
          description={friendlyAuthError(orgQ.error)}
          onRetry={() => orgQ.refetch()}
        />
      ) : !rows.length ? (
        <EmptyState
          title={`No ${kind}s yet`}
          description="Create organisation units before assigning them on employee HR profiles."
          action={
            canManage ? (
              <Button type="button" onClick={() => setOpen(true)}>
                Add {kind}
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
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.isActive ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {orgQ.data?.departments.length ? (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Department hierarchy
          </h2>
          <ul className="space-y-1 text-sm">
            {orgQ.data.departments
              .filter((d) => d.isActive)
              .map((dept) => {
                const parent = orgQ.data?.departments.find((d) => d.id === dept.parentId);
                return (
                  <li key={dept.id} className="rounded-md border border-border px-3 py-2">
                    <span className="font-medium">{dept.name}</span>
                    {parent ? (
                      <span className="text-muted-foreground"> · reports under {parent.name}</span>
                    ) : (
                      <span className="text-muted-foreground"> · top level</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {kind}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="org-code">Code</Label>
              <Input id="org-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {kind === "location" ? (
              <div className="space-y-1">
                <Label htmlFor="org-tz">Timezone</Label>
                <Input
                  id="org-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC"
                />
              </div>
            ) : null}
            {kind === "designation" ? (
              <div className="space-y-1">
                <Label htmlFor="org-grade">Grade code</Label>
                <Input
                  id="org-grade"
                  value={gradeCode}
                  onChange={(e) => setGradeCode(e.target.value)}
                />
              </div>
            ) : null}
            {kind === "department" ? (
              <div className="space-y-1">
                <Label>Parent department</Label>
                <RecordLookupSelect
                  value={parentId || "__none"}
                  onValueChange={(value) => setParentId(value === "__none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
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
            ) : null}
            {kind === "branch" ? (
              <div className="space-y-1">
                <Label>Location</Label>
                <RecordLookupSelect
                  value={locationId || "__none"}
                  onValueChange={(value) => setLocationId(value === "__none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
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
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !code.trim() || !name.trim()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
