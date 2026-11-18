import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Plus, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useDebounced } from "@/hooks/use-debounced";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { downloadCsv } from "@/lib/reports/csv";
import { planPayrollEmployeeImport } from "@/lib/payroll/employee-import-plan";
import {
  emptyEmployeeDraft,
  parsePayrollEmployeesCsv,
  payrollEmployeesToCsv,
  parsePayrollEmployeeDraft,
  type PayrollEmployeeDraft,
} from "@/lib/payroll/employee-draft";
import { listPayrollEmployees, savePayrollEmployee } from "@/lib/payroll/employees.functions";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, PAYMENT_METHODS } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/common/StatusBadge";
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

const STATUS_LABEL: Record<(typeof EMPLOYEE_STATUSES)[number], string> = {
  active: "Active",
  archived: "Archived",
  terminated: "Terminated",
};

export function PayrollEmployeesPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canManage = useCanDo("payroll.employees.manage");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listPayrollEmployees);
  const fetchSettings = useServerFn(getPayrollSettingsPage);
  const saveEmployee = useServerFn(savePayrollEmployee);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "number" | "hire-newest">("name");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [addOpen, setAddOpen] = useState(false);
  const [newDraft, setNewDraft] = useState<PayrollEmployeeDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    companyId: string;
    fileName: string;
    total: number;
    skipped: number;
    drafts: PayrollEmployeeDraft[];
  } | null>(null);
  const [importDone, setImportDone] = useState(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Synchronous guard: two rapid clicks must never start overlapping writes.
  const importBusyRef = useRef(false);

  const settingsQ = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const listQ = useQuery({
    queryKey: ["payroll-employees", company?.id, statusFilter, q],
    queryFn: () =>
      fetchList({
        data: {
          companyId: company!.id,
          status: statusFilter === "all" ? null : statusFilter,
          q,
        },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  const createM = useMutation({
    mutationFn: (draft: PayrollEmployeeDraft) =>
      saveEmployee({ data: { companyId: company!.id, draft } }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["payroll-employees", company?.id] });
      setAddOpen(false);
      toast.success("Employee added");
      void navigate({ to: "/payroll/employees/$employeeId", params: { employeeId: row.id } });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Payroll employees" description="Employee records for Basic Payroll.">
        <EmptyState
          title="No payroll access"
          description="Ask an organisation administrator for the payroll.view permission."
        />
      </ListWorkspace>
    );
  }
  if (listQ.isPending || settingsQ.isPending) return <LoadingState />;
  if (settingsQ.isError) {
    return (
      <ErrorState
        title="Could not load payroll settings"
        description={friendlyAuthError(settingsQ.error)}
        onRetry={() => settingsQ.refetch()}
      />
    );
  }
  if (listQ.isError) {
    return (
      <ErrorState
        title="Could not load employees"
        description={friendlyAuthError(listQ.error)}
        onRetry={() => listQ.refetch()}
      />
    );
  }

  const settings = settingsQ.data;
  const list = listQ.data;
  const country =
    settings?.settings?.operating_country_code ??
    settings?.company.country_code ??
    company.country_code;
  const currency =
    settings?.settings?.payroll_currency ??
    settings?.company.base_currency ??
    company.base_currency;

  const filtersActive = statusFilter !== "all" || search.trim() !== "";
  const clearFilters = () => {
    setStatusFilter("all");
    setSearch("");
  };
  const displayedEmployees = [...list.employees].sort((a, b) => {
    if (sort === "number") return a.employee_number.localeCompare(b.employee_number);
    if (sort === "hire-newest") return b.hire_date.localeCompare(a.hire_date);
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  const openAdd = () => {
    setNewDraft(emptyEmployeeDraft(country, currency));
    setAddOpen(true);
  };

  const exportCsv = () => {
    downloadCsv("linkbooks-payroll-employees.csv", payrollEmployeesToCsv(displayedEmployees));
    toast.success(`Exported ${displayedEmployees.length} employees in displayed order`);
  };

  const importCsv = async (file: File | null) => {
    if (!file || !company || !canManage || importBusyRef.current) return;
    importBusyRef.current = true;
    setImporting(true);
    setImportPreview(null);
    try {
      if (file.size > 1_000_000) {
        throw new Error("Employee CSV exceeds the 1 MB file size limit.");
      }
      const text = await file.text();
      const parsed = parsePayrollEmployeesCsv(text, { country, currency });
      if (!parsed.ok) throw new Error(parsed.error);
      // Compare against the full organisation list, not the current search subset.
      // CSV lacks salary/bank fields, so existing employee IDs are never overwritten.
      const current = await fetchList({ data: { companyId: company.id, status: null, q: null } });
      if (!current.available)
        throw new Error(current.migrationMessage ?? "Employee data unavailable.");
      const existing = new Set(current.employees.map((employee) => employee.employee_number));
      const { toCreate: drafts, skipped } = planPayrollEmployeeImport(parsed.drafts, existing);
      setImportDone(0);
      setImportPreview({
        companyId: company.id,
        fileName: file.name,
        total: parsed.drafts.length,
        skipped,
        drafts,
      });
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      importBusyRef.current = false;
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (
      !importPreview ||
      !company ||
      importPreview.companyId !== company.id ||
      !canManage ||
      importBusyRef.current
    )
      return;
    importBusyRef.current = true;
    setImporting(true);
    let created = 0;
    let newlySkipped = 0;
    try {
      // Recheck on confirmation: another session may have created an employee
      // during CSV review. Never overwrite those employee records.
      const current = await fetchList({ data: { companyId: company.id, status: null, q: null } });
      if (!current.available)
        throw new Error(current.migrationMessage ?? "Employee data unavailable.");
      const existing = new Set(current.employees.map((employee) => employee.employee_number));
      const plan = planPayrollEmployeeImport(importPreview.drafts, existing);
      newlySkipped = plan.skipped;
      setImportDone(newlySkipped);
      for (const draft of plan.toCreate) {
        await saveEmployee({ data: { companyId: company.id, draft } });
        created += 1;
        setImportDone(created + newlySkipped);
      }
      toast.success(
        `Imported ${created} employees; skipped ${importPreview.skipped + newlySkipped} existing IDs.`,
      );
    } catch (error) {
      toast.error(`Import stopped after ${created} saved and ${newlySkipped} newly skipped rows.`, {
        description: `Earlier rows were saved; later rows were not attempted. ${friendlyAuthError(error)}`,
      });
    } finally {
      // Unlock before invalidating/refetching: a failed refresh must not leave
      // the import action disabled after some rows were committed.
      importBusyRef.current = false;
      setImportPreview(null);
      setImporting(false);
      void queryClient.invalidateQueries({ queryKey: ["payroll-employees", company.id] });
    }
  };

  if (addOpen && newDraft) {
    return (
      <RecordWorkspace
        title="Add payroll employee"
        description="Create an employee profile with payment details for payroll runs."
        breadcrumbs={[
          { label: "Payroll", to: "/payroll" },
          { label: "Employees", to: "/payroll/employees" },
          { label: "New" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={createM.isPending}
              onClick={() => {
                const parsed = parsePayrollEmployeeDraft(newDraft);
                if (!parsed.ok) {
                  toast.error(parsed.error);
                  return;
                }
                createM.mutate(newDraft);
              }}
            >
              {createM.isPending ? "Saving…" : "Save employee"}
            </Button>
          </div>
        }
      >
        <EmployeeForm
          draft={newDraft}
          onChange={setNewDraft}
          schedules={settings?.schedules ?? []}
        />
      </RecordWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Payroll employees"
      description="Manage employee profiles, payment details and salary assignments."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!list.available}>
            <Download className="mr-2 h-4 w-4" />
            Export current view
          </Button>
          {canManage ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void importCsv(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!list.available || importing}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing ? "Preparing…" : "Import CSV"}
              </Button>
              <Button size="sm" onClick={openAdd} disabled={!list.available}>
                <Plus className="mr-2 h-4 w-4" />
                Add employee
              </Button>
            </>
          ) : null}
        </div>
      }
      subnav={<PayrollSubnav current="employees" />}
    >
      {!list.available ? (
        <Alert>
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{list.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              className="max-w-xs"
              placeholder="Search name, ID, email, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search employees"
            />
            <RecordLookupSelect value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {EMPLOYEE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger className="w-[170px]" aria-label="Sort employees">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name: A to Z</SelectItem>
                <SelectItem value="number">Employee ID</SelectItem>
                <SelectItem value="hire-newest">Hire date: newest</SelectItem>
              </SelectContent>
            </Select>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
            <p className="w-full text-xs text-muted-foreground" aria-live="polite">
              Showing {displayedEmployees.length} employees
              {filtersActive ? " matching filters" : ""}
            </p>
          </div>

          {list.employees.length === 0 ? (
            <EmptyState
              icon={Users}
              title={filtersActive ? "No matching employees" : "No employees yet"}
              description={
                filtersActive
                  ? "No employees match the current search or status filter."
                  : "Add your first payroll employee to assign pay and payment details."
              }
              action={
                filtersActive ? (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : canManage ? (
                  <Button size="sm" onClick={openAdd}>
                    Add employee
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Hire date</TableHead>
                    <TableHead>Currency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedEmployees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <Link
                          to="/payroll/employees/$employeeId"
                          params={{ employeeId: emp.id }}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {emp.employee_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {emp.first_name} {emp.last_name}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={emp.status} label={STATUS_LABEL[emp.status]} />
                      </TableCell>
                      <TableCell>{emp.department ?? "—"}</TableCell>
                      <TableCell>{emp.hire_date}</TableCell>
                      <TableCell>{emp.payroll_currency}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </>
      )}

      <Dialog
        open={importPreview !== null}
        onOpenChange={(open) => {
          if (!open && !importing) setImportPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review employee CSV import</DialogTitle>
          </DialogHeader>
          {importPreview ? (
            <div className="space-y-3 text-sm">
              <p className="break-all text-muted-foreground">{importPreview.fileName}</p>
              <dl className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
                <div>
                  <dt className="text-muted-foreground">In file</dt>
                  <dd className="text-lg font-semibold tabular-nums">{importPreview.total}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">New</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {importPreview.drafts.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Skipped</dt>
                  <dd className="text-lg font-semibold tabular-nums">{importPreview.skipped}</dd>
                </div>
              </dl>
              <Alert>
                <AlertTitle>Create new employees only</AlertTitle>
                <AlertDescription>
                  Existing employee IDs will be skipped, never overwritten. Files without employee
                  IDs generate new records; importing them twice may create duplicates. This is a
                  sequential import, not a database transaction. If a row fails, earlier saved rows
                  remain in place.
                </AlertDescription>
              </Alert>
              {importing ? (
                <p role="status" aria-live="polite">
                  Processed {importDone} of {importPreview.drafts.length} new rows…
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={importing} onClick={() => setImportPreview(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                importing || !importPreview?.drafts.length || importPreview.companyId !== company.id
              }
              onClick={() => void confirmImport()}
            >
              {importing
                ? "Importing…"
                : `Import ${importPreview?.drafts.length ?? 0} new employees`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </ListWorkspace>
  );
}

function EmployeeForm({
  draft,
  onChange,
  schedules,
}: {
  draft: PayrollEmployeeDraft;
  onChange: (d: PayrollEmployeeDraft) => void;
  schedules: { id: string; name: string; is_active: boolean }[];
}) {
  const patch = (p: Partial<PayrollEmployeeDraft>) => onChange({ ...draft, ...p });
  return (
    <div className="grid gap-3 py-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emp-first">First name</Label>
          <Input
            id="emp-first"
            value={draft.firstName}
            onChange={(e) => patch({ firstName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-last">Last name</Label>
          <Input
            id="emp-last"
            value={draft.lastName}
            onChange={(e) => patch({ lastName: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-number">Employee ID (optional)</Label>
        <Input
          id="emp-number"
          value={draft.employeeNumber}
          placeholder="Auto-assigned when blank"
          onChange={(e) => patch({ employeeNumber: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-email">Email</Label>
        <Input
          id="emp-email"
          type="email"
          value={draft.email}
          onChange={(e) => patch({ email: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emp-hire">Hire date</Label>
          <Input
            id="emp-hire"
            type="date"
            value={draft.hireDate}
            onChange={(e) => patch({ hireDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-status">Status</Label>
          <RecordLookupSelect
            value={draft.status}
            onValueChange={(v) => patch({ status: v as PayrollEmployeeDraft["status"] })}
          >
            <SelectTrigger id="emp-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYEE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </RecordLookupSelect>
        </div>
      </div>
      {draft.status === "terminated" ? (
        <div className="space-y-1">
          <Label htmlFor="emp-term">Termination date</Label>
          <Input
            id="emp-term"
            type="date"
            value={draft.terminationDate}
            onChange={(e) => patch({ terminationDate: e.target.value })}
          />
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emp-type">Employment type</Label>
          <RecordLookupSelect
            value={draft.employmentType}
            onValueChange={(v) =>
              patch({ employmentType: v as PayrollEmployeeDraft["employmentType"] })
            }
          >
            <SelectTrigger id="emp-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </RecordLookupSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-pay-method">Payment method</Label>
          <RecordLookupSelect
            value={draft.paymentMethod}
            onValueChange={(v) =>
              patch({ paymentMethod: v as PayrollEmployeeDraft["paymentMethod"] })
            }
          >
            <SelectTrigger id="emp-pay-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </RecordLookupSelect>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emp-country">Payroll country</Label>
          <Input
            id="emp-country"
            value={draft.payrollCountryCode}
            maxLength={2}
            onChange={(e) => patch({ payrollCountryCode: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-currency">Payroll currency</Label>
          <Input
            id="emp-currency"
            value={draft.payrollCurrency}
            maxLength={3}
            onChange={(e) => patch({ payrollCurrency: e.target.value.toUpperCase() })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-schedule">Pay schedule</Label>
        <RecordLookupSelect
          value={draft.payScheduleId || "none"}
          onValueChange={(v) => patch({ payScheduleId: v === "none" ? "" : v })}
        >
          <SelectTrigger id="emp-schedule">
            <SelectValue placeholder="Optional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {schedules
              .filter((s) => s.is_active)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </RecordLookupSelect>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emp-dept">Department</Label>
          <Input
            id="emp-dept"
            value={draft.department}
            onChange={(e) => patch({ department: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-role">Designation</Label>
          <Input
            id="emp-role"
            value={draft.designation}
            onChange={(e) => patch({ designation: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="emp-notes">Notes</Label>
        <Textarea
          id="emp-notes"
          value={draft.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  );
}
