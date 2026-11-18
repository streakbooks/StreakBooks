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
import { listHrCases, upsertHrCase } from "@/lib/hr/people.functions";
import { HR_CASE_SEVERITIES, HR_CASE_STATUSES, HR_CASE_TYPES } from "@/lib/hr/people-types";

export function HrRelationsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.cases.manage");
  const queryClient = useQueryClient();
  const fetchCases = useServerFn(listHrCases);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveCase = useServerFn(upsertHrCase);

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [caseType, setCaseType] = useState("grievance");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [status, setStatus] = useState("open");
  const [summary, setSummary] = useState("");

  const casesQ = useQuery({
    queryKey: ["hr-cases", company?.id],
    queryFn: () => fetchCases({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-cases", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && open,
    retry: false,
  });

  const saveM = useMutation({
    mutationFn: () =>
      saveCase({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            caseType,
            title: title.trim(),
            status,
            severity,
            openedOn: null,
            summary: summary.trim() || null,
            resolutionNotes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Case saved");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["hr-cases", company?.id] });
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canView) {
    return (
      <ListWorkspace
        title="Employee Relations"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Relations" }]}
      subnav={<HrSubnav current="relations" />}
    >
        <EmptyState title="No access" description="You need hr.view to open employee relations." />
      </ListWorkspace>
    );
  }

  const items = casesQ.data?.items ?? [];
  const employees = employeesQ.data?.items ?? [];

  return (
    <ListWorkspace
      title="Employee Relations"
      description="Grievances, disciplinary and investigation cases with severity and status tracking."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Relations" }]}
      actions={
        canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEmployeeId("");
              setCaseType("grievance");
              setTitle("");
              setSeverity("medium");
              setStatus("open");
              setSummary("");
              setOpen(true);
            }}
          >
            Open case
          </Button>
        ) : undefined
      }
      subnav={<HrSubnav current="relations" />}
    >
      {casesQ.isPending ? (
        <LoadingState />
      ) : casesQ.isError ? (
        <ErrorState
          title="Could not load cases"
          description={friendlyAuthError(casesQ.error)}
          onRetry={() => void casesQ.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No cases"
          description="Open a grievance or disciplinary case when needed."
          action={
            canManage ? (
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setEmployeeId("");
                  setCaseType("grievance");
                  setTitle("");
                  setSeverity("medium");
                  setStatus("open");
                  setSummary("");
                  setOpen(true);
                }}
              >
                Open case
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
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.caseNumber}</TableCell>
                  <TableCell>{row.employeeName ?? "—"}</TableCell>
                  <TableCell>{row.caseType}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.severity}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open HR case</DialogTitle>
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
              <Label>Type</Label>
              <RecordLookupSelect value={caseType} onValueChange={setCaseType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_CASE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Severity</Label>
                <RecordLookupSelect value={severity} onValueChange={setSeverity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_CASE_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <RecordLookupSelect value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_CASE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Summary</Label>
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!employeeId || !title.trim() || saveM.isPending}
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
