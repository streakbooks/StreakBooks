import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  employeeDraftFromRow,
  emptyPaymentDetailsDraft,
  parsePaymentDetailsDraft,
  parsePayrollEmployeeDraft,
  parseSalaryAssignDraft,
  type PaymentDetailsDraft,
  type PayrollEmployeeDraft,
  type SalaryAssignDraft,
  type SalaryAssignLineDraft,
} from "@/lib/payroll/employee-draft";
import {
  assignPayrollEmployeeSalary,
  getPayrollEmployeePage,
  savePayrollEmployee,
  savePayrollEmployeePaymentDetails,
} from "@/lib/payroll/employees.functions";
import { listPayrollPayslips } from "@/lib/payroll/runs.functions";
import type { PayrollComponentTypeRow } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { AttachmentsPanel } from "@/components/documents/AttachmentsPanel";
import { bpsToPercentString } from "@/components/sales/sales-form-utils";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

function emptySalaryAssignLine(components: PayrollComponentTypeRow[]): SalaryAssignLineDraft {
  const active = components.filter((c) => c.is_active);
  return {
    componentTypeId: active[0]?.id ?? "",
    amount: "0",
    rate: "0",
    percentage: "0",
    isRecurring: true,
    notes: "",
  };
}

export function PayrollEmployeeDetailPage({ employeeId }: { employeeId: string }) {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canManage = useCanDo("payroll.employees.manage");
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchPage = useServerFn(getPayrollEmployeePage);
  const saveEmployeeFn = useServerFn(savePayrollEmployee);
  const savePaymentFn = useServerFn(savePayrollEmployeePaymentDetails);
  const assignSalaryFn = useServerFn(assignPayrollEmployeeSalary);
  const fetchRecentPayslips = useServerFn(listPayrollPayslips);

  const pageQ = useQuery({
    queryKey: ["payroll-employee-page", company?.id, employeeId],
    queryFn: () => fetchPage({ data: { companyId: company!.id, employeeId } }),
    enabled: Boolean(company?.id) && canView,
  });

  const recentPayslipsQ = useQuery({
    queryKey: ["payroll-employee-payslips", company?.id, employeeId],
    queryFn: () =>
      fetchRecentPayslips({
        data: { companyId: company!.id, employeeId, limit: 5 },
      }),
    enabled: Boolean(company?.id) && canView,
  });

  const [profileDraft, setProfileDraft] = useState<PayrollEmployeeDraft | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDetailsDraft>(emptyPaymentDetailsDraft());
  const [salaryDraft, setSalaryDraft] = useState<SalaryAssignDraft>({
    structureId: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    changeReason: "",
    customLines: [],
  });

  useEffect(() => {
    if (!pageQ.data) return;
    setProfileDraft(employeeDraftFromRow(pageQ.data.employee));
    setPaymentDraft(emptyPaymentDetailsDraft());
  }, [pageQ.data]);

  const componentMap = useMemo(() => {
    const map = new Map<string, PayrollComponentTypeRow>();
    for (const c of pageQ.data?.components ?? []) map.set(c.id, c);
    return map;
  }, [pageQ.data?.components]);

  const activeComponents = useMemo(
    () => (pageQ.data?.components ?? []).filter((c) => c.is_active),
    [pageQ.data?.components],
  );

  const customLinesOnly = !salaryDraft.structureId;

  const saveProfileM = useMutation({
    mutationFn: (draft: PayrollEmployeeDraft) =>
      saveEmployeeFn({ data: { companyId: company!.id, draft } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["payroll-employee-page", company?.id, employeeId],
      });
      await queryClient.invalidateQueries({ queryKey: ["payroll-employees", company?.id] });
      toast.success("Employee saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const savePaymentM = useMutation({
    mutationFn: (draft: PaymentDetailsDraft) =>
      savePaymentFn({ data: { companyId: company!.id, employeeId, draft } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["payroll-employee-page", company?.id, employeeId],
      });
      setPaymentDraft(emptyPaymentDetailsDraft());
      toast.success("Payment details saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const assignSalaryM = useMutation({
    mutationFn: (draft: SalaryAssignDraft) =>
      assignSalaryFn({
        data: {
          companyId: company!.id,
          employeeId,
          draft,
          currencyCode: pageQ.data!.employee.payroll_currency,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["payroll-employee-page", company?.id, employeeId],
      });
      setSalaryDraft({
        structureId: "",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        changeReason: "",
        customLines: [],
      });
      toast.success("Salary assigned");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <EmptyState
        title="No payroll access"
        description="Ask an organisation administrator for the payroll.view permission."
      />
    );
  }
  if (pageQ.isPending) return <LoadingState />;
  if (pageQ.isError) {
    return <QueryErrorState queries={[pageQ]} title="Employee not found" />;
  }
  if (!pageQ.isSuccess || !pageQ.data) return null;

  const data = pageQ.data;
  const emp = data.employee;
  const currency = emp.payroll_currency;
  const currentVersion =
    data.salary_versions.find((v) => !v.effective_to) ?? data.salary_versions[0];
  const currentLines = currentVersion
    ? data.salary_lines.filter((l) => l.version_id === currentVersion.id)
    : [];
  const hasPaymentOnFile = Boolean(
    data.payment &&
    (data.payment.has_account_number ||
      data.payment.has_iban ||
      data.payment.has_sort_code ||
      data.payment.account_name ||
      data.payment.bank_name),
  );
  const structureById = new Map(data.structures.map((s) => [s.id, s.name] as const));
  const salaryHistory = [...data.salary_versions]
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
    .slice(0, 3);
  const recentPayslips =
    recentPayslipsQ.data?.available === true ? recentPayslipsQ.data.payslips : [];

  return (
    <RecordWorkspace
      title={`${emp.first_name} ${emp.last_name}`}
      description={`${emp.employee_number} · ${emp.payroll_currency} payroll`}
      insights={
        <WorkspaceInsights
          title="Related"
          facts={[
            { label: "Employee #", value: emp.employee_number },
            { label: "Currency", value: currency },
            {
              label: "Salary",
              value: currentVersion ? "Current version on file" : "Not assigned",
            },
            {
              label: "Payment details",
              value: hasPaymentOnFile ? "On file" : "Missing",
            },
            { label: "Recent payslips", value: String(recentPayslips.length) },
          ]}
          links={[
            {
              label: "All employees",
              to: "/payroll/employees",
              hint: "Return to the employee directory",
            },
            {
              label: "Payslips",
              to: "/payroll/payslips",
              hint: "Browse payslips",
            },
            ...(emp.contact_id
              ? [
                  {
                    label: "Linked contact",
                    to: "/contacts/$contactId",
                    params: { contactId: emp.contact_id },
                    hint: "Open the HR contact record",
                  },
                ]
              : []),
          ]}
          footer="Facts reflect payroll master data only — no invented balances."
        />
      }
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/payroll/employees">Back to employees</Link>
        </Button>
      }
    >
      <PayrollSubnav current="employees" />

      {canManage && (!currentVersion || !hasPaymentOnFile) ? (
        <div className="mb-4 rounded-lg border border-dashed border-amber-200/80 bg-amber-50/40 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="font-medium text-foreground">Next steps for this employee</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {!currentVersion ? (
              <li>
                Assign a current salary below, or create a{" "}
                <Link to="/payroll/salary-structures" className="text-primary hover:underline">
                  salary structure
                </Link>{" "}
                first.
              </li>
            ) : null}
            {!hasPaymentOnFile ? (
              <li>Add payment details below so net pay can be settled.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Employment details synced to the linked contact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profileDraft ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="detail-first">First name</Label>
                    <Input
                      id="detail-first"
                      value={profileDraft.firstName}
                      disabled={!canManage}
                      onChange={(e) =>
                        setProfileDraft({ ...profileDraft, firstName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="detail-last">Last name</Label>
                    <Input
                      id="detail-last"
                      value={profileDraft.lastName}
                      disabled={!canManage}
                      onChange={(e) =>
                        setProfileDraft({ ...profileDraft, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="detail-email">Email</Label>
                  <Input
                    id="detail-email"
                    type="email"
                    disabled={!canManage}
                    value={profileDraft.email}
                    onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="detail-hire">Hire date</Label>
                    <Input
                      id="detail-hire"
                      type="date"
                      disabled={!canManage}
                      value={profileDraft.hireDate}
                      onChange={(e) =>
                        setProfileDraft({ ...profileDraft, hireDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="detail-status">Status</Label>
                    <Select
                      disabled={!canManage}
                      value={profileDraft.status}
                      onValueChange={(v) =>
                        setProfileDraft({
                          ...profileDraft,
                          status: v as PayrollEmployeeDraft["status"],
                        })
                      }
                    >
                      <SelectTrigger id="detail-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {profileDraft.status === "terminated" ? (
                  <div className="space-y-1">
                    <Label htmlFor="detail-term">Termination date</Label>
                    <Input
                      id="detail-term"
                      type="date"
                      disabled={!canManage}
                      value={profileDraft.terminationDate}
                      onChange={(e) =>
                        setProfileDraft({ ...profileDraft, terminationDate: e.target.value })
                      }
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="detail-dept">Department</Label>
                  <Input
                    id="detail-dept"
                    disabled={!canManage}
                    value={profileDraft.department}
                    onChange={(e) =>
                      setProfileDraft({ ...profileDraft, department: e.target.value })
                    }
                  />
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    disabled={saveProfileM.isPending}
                    onClick={() => {
                      const parsed = parsePayrollEmployeeDraft(profileDraft);
                      if (!parsed.ok) {
                        toast.error(parsed.error);
                        return;
                      }
                      saveProfileM.mutate(profileDraft);
                    }}
                  >
                    Save profile
                  </Button>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment details</CardTitle>
            <CardDescription>
              Banking identifiers are stored securely and only shown masked after save.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.payment ? (
              <dl className="grid grid-cols-2 gap-2 rounded-md border p-3">
                <div>
                  <dt className="text-muted-foreground">Account name</dt>
                  <dd>{data.payment.account_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bank</dt>
                  <dd>{data.payment.bank_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Account number</dt>
                  <dd>
                    {data.payment.account_number_masked ??
                      (data.payment.has_account_number ? "On file" : "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sort code</dt>
                  <dd>
                    {data.payment.sort_code_masked ??
                      (data.payment.has_sort_code ? "On file" : "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">IBAN</dt>
                  <dd>{data.payment.iban_masked ?? (data.payment.has_iban ? "On file" : "—")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">BIC</dt>
                  <dd>{data.payment.bic ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">No payment details on file.</p>
            )}

            {canManage ? (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Enter new values to replace stored identifiers. Leave fields blank to keep
                  existing values unless you tick clear.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="pay-account-name">Account name</Label>
                  <Input
                    id="pay-account-name"
                    value={paymentDraft.accountName}
                    onChange={(e) =>
                      setPaymentDraft({ ...paymentDraft, accountName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pay-bank">Bank name</Label>
                  <Input
                    id="pay-bank"
                    value={paymentDraft.bankName}
                    onChange={(e) => setPaymentDraft({ ...paymentDraft, bankName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pay-acct">Account number</Label>
                  <Input
                    id="pay-acct"
                    value={paymentDraft.accountNumber}
                    onChange={(e) =>
                      setPaymentDraft({ ...paymentDraft, accountNumber: e.target.value })
                    }
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={paymentDraft.clearAccountNumber}
                      onCheckedChange={(c) =>
                        setPaymentDraft({ ...paymentDraft, clearAccountNumber: c === true })
                      }
                    />
                    Clear stored account number
                  </label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pay-sort">Sort code</Label>
                  <Input
                    id="pay-sort"
                    value={paymentDraft.sortCode}
                    placeholder="12-34-56"
                    onChange={(e) => setPaymentDraft({ ...paymentDraft, sortCode: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={paymentDraft.clearSortCode}
                      onCheckedChange={(c) =>
                        setPaymentDraft({ ...paymentDraft, clearSortCode: c === true })
                      }
                    />
                    Clear stored sort code
                  </label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pay-iban">IBAN</Label>
                  <Input
                    id="pay-iban"
                    value={paymentDraft.iban}
                    onChange={(e) => setPaymentDraft({ ...paymentDraft, iban: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={paymentDraft.clearIban}
                      onCheckedChange={(c) =>
                        setPaymentDraft({ ...paymentDraft, clearIban: c === true })
                      }
                    />
                    Clear stored IBAN
                  </label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pay-bic">BIC</Label>
                  <Input
                    id="pay-bic"
                    value={paymentDraft.bic}
                    onChange={(e) => setPaymentDraft({ ...paymentDraft, bic: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={paymentDraft.clearBic}
                      onCheckedChange={(c) =>
                        setPaymentDraft({ ...paymentDraft, clearBic: c === true })
                      }
                    />
                    Clear stored BIC
                  </label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savePaymentM.isPending}
                  onClick={() => {
                    const parsed = parsePaymentDetailsDraft(paymentDraft);
                    if (!parsed.ok) {
                      toast.error(parsed.error);
                      return;
                    }
                    savePaymentM.mutate(paymentDraft);
                  }}
                >
                  Save payment details
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Current salary</CardTitle>
            <CardDescription>
              Effective-dated salary from structures or custom component lines.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentVersion ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">From {fmt.date(currentVersion.effective_from)}</Badge>
                {currentVersion.change_reason ? (
                  <span className="text-muted-foreground">{currentVersion.change_reason}</span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No salary assigned yet.</p>
            )}
            {currentLines.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Fixed</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentLines.map((line) => {
                    const comp = componentMap.get(line.component_type_id);
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          {comp ? `${comp.code} — ${comp.name}` : line.component_type_id}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt.money(line.amount_minor, currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fromMinorUnits(line.rate_minor, currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {bpsToPercentString(line.percentage_bps)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}

            {canManage ? (
              <div className="rounded-md border p-4 space-y-3">
                <p className="text-sm font-medium">Assign new salary</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="salary-structure">Salary structure</Label>
                    <RecordLookupSelect
                      value={salaryDraft.structureId || "none"}
                      onValueChange={(v) => {
                        const structureId = v === "none" ? "" : v;
                        setSalaryDraft((prev) => {
                          const next = { ...prev, structureId };
                          if (!structureId && next.customLines.length === 0) {
                            next.customLines = [emptySalaryAssignLine(activeComponents)];
                          }
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger id="salary-structure">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Custom lines only</SelectItem>
                        {data.structures.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="salary-from">Effective from</Label>
                    <Input
                      id="salary-from"
                      type="date"
                      value={salaryDraft.effectiveFrom}
                      onChange={(e) =>
                        setSalaryDraft({ ...salaryDraft, effectiveFrom: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="salary-reason">Change reason</Label>
                  <Textarea
                    id="salary-reason"
                    rows={2}
                    value={salaryDraft.changeReason}
                    onChange={(e) =>
                      setSalaryDraft({ ...salaryDraft, changeReason: e.target.value })
                    }
                  />
                </div>
                {customLinesOnly ? (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">
                      Custom lines only: add at least one pay component and fixed amount before pay
                      runs can calculate this employee&apos;s salary. Create missing components
                      under{" "}
                      <Link to="/payroll/settings" className="text-primary hover:underline">
                        Payroll settings
                      </Link>
                      .
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Custom salary lines</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSalaryDraft({
                            ...salaryDraft,
                            customLines: [
                              ...salaryDraft.customLines,
                              emptySalaryAssignLine(activeComponents),
                            ],
                          })
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add line
                      </Button>
                    </div>
                    {salaryDraft.customLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No lines yet — add a component.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {salaryDraft.customLines.map((line, index) => (
                          <div
                            key={index}
                            className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
                          >
                            <div className="flex items-start justify-between gap-2 sm:col-span-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <Label>Pay component</Label>
                                <RecordLookupSelect
                                  value={line.componentTypeId || "none"}
                                  onValueChange={(v) => {
                                    const customLines = [...salaryDraft.customLines];
                                    customLines[index] = {
                                      ...line,
                                      componentTypeId: v === "none" ? "" : v,
                                    };
                                    setSalaryDraft({ ...salaryDraft, customLines });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose component" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {activeComponents.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.code} — {c.name} ({c.kind})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </RecordLookupSelect>
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="mt-6 shrink-0"
                                aria-label="Remove line"
                                onClick={() => {
                                  const customLines = salaryDraft.customLines.filter(
                                    (_, i) => i !== index,
                                  );
                                  setSalaryDraft({ ...salaryDraft, customLines });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-1">
                              <Label>Fixed amount ({currency})</Label>
                              <Input
                                value={line.amount}
                                inputMode="decimal"
                                onChange={(e) => {
                                  const customLines = [...salaryDraft.customLines];
                                  customLines[index] = { ...line, amount: e.target.value };
                                  setSalaryDraft({ ...salaryDraft, customLines });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Rate ({currency})</Label>
                              <Input
                                value={line.rate}
                                inputMode="decimal"
                                onChange={(e) => {
                                  const customLines = [...salaryDraft.customLines];
                                  customLines[index] = { ...line, rate: e.target.value };
                                  setSalaryDraft({ ...salaryDraft, customLines });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Percentage</Label>
                              <Input
                                value={line.percentage}
                                inputMode="decimal"
                                onChange={(e) => {
                                  const customLines = [...salaryDraft.customLines];
                                  customLines[index] = { ...line, percentage: e.target.value };
                                  setSalaryDraft({ ...salaryDraft, customLines });
                                }}
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm sm:col-span-2">
                              <Checkbox
                                checked={line.isRecurring}
                                onCheckedChange={(c) => {
                                  const customLines = [...salaryDraft.customLines];
                                  customLines[index] = {
                                    ...line,
                                    isRecurring: c === true,
                                  };
                                  setSalaryDraft({ ...salaryDraft, customLines });
                                }}
                              />
                              Recurring each pay run
                            </label>
                            <div className="space-y-1 sm:col-span-2">
                              <Label>Notes (optional)</Label>
                              <Input
                                value={line.notes}
                                onChange={(e) => {
                                  const customLines = [...salaryDraft.customLines];
                                  customLines[index] = { ...line, notes: e.target.value };
                                  setSalaryDraft({ ...salaryDraft, customLines });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                <Button
                  size="sm"
                  disabled={assignSalaryM.isPending}
                  onClick={() => {
                    const parsed = parseSalaryAssignDraft(salaryDraft, currency);
                    if (!parsed.ok) {
                      toast.error(parsed.error);
                      return;
                    }
                    assignSalaryM.mutate(salaryDraft);
                  }}
                >
                  Assign salary
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent payroll activity</CardTitle>
            <CardDescription>Latest payslips and salary assignment history.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Payslips</p>
              {recentPayslipsQ.isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : recentPayslipsQ.isError ? (
                <QueryErrorState
                  queries={[recentPayslipsQ]}
                  title="Could not load recent payslips"
                />
              ) : !recentPayslipsQ.isSuccess ? (
                <LoadingState />
              ) : recentPayslips.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payslips issued yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {recentPayslips.map(({ payslip, run }) => (
                    <li
                      key={payslip.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <Link
                        to="/payroll/payslips/$payslipId"
                        params={{ payslipId: payslip.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {payslip.payslip_number}
                      </Link>
                      <span className="text-muted-foreground">
                        {fmt.date(payslip.issued_at)} · {run.run_number}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="link" size="sm" className="h-auto px-0">
                <Link to="/payroll/payslips">All payslips</Link>
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Salary assignments</p>
              {salaryHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No salary history yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {salaryHistory.map((version) => {
                    const structureLabel = version.structure_id
                      ? (structureById.get(version.structure_id) ?? "Structure")
                      : "Custom lines";
                    const range = version.effective_to
                      ? `${fmt.date(version.effective_from)} – ${fmt.date(version.effective_to)}`
                      : `From ${fmt.date(version.effective_from)}`;
                    return (
                      <li key={version.id} className="rounded-md border px-3 py-2">
                        <p className="font-medium">{structureLabel}</p>
                        <p className="text-muted-foreground">{range}</p>
                        {version.change_reason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {version.change_reason}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <AttachmentsPanel
            entityType="contact"
            entityId={emp.contact_id}
            title="Contact attachments"
          />
        </div>
      </div>
    </RecordWorkspace>
  );
}
