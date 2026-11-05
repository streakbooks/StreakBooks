import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
} from "@/lib/payroll/employee-draft";
import {
  assignPayrollEmployeeSalary,
  getPayrollEmployeePage,
  savePayrollEmployee,
  savePayrollEmployeePaymentDetails,
} from "@/lib/payroll/employees.functions";
import type { PayrollComponentTypeRow } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { AttachmentsPanel } from "@/components/documents/AttachmentsPanel";
import { bpsToPercentString } from "@/components/sales/sales-form-utils";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
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

  const pageQ = useQuery({
    queryKey: ["payroll-employee-page", company?.id, employeeId],
    queryFn: () => fetchPage({ data: { companyId: company!.id, employeeId } }),
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
    return (
      <ErrorState
        title="Employee not found"
        description={friendlyAuthError(pageQ.error)}
        onRetry={() => pageQ.refetch()}
      />
    );
  }

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

  return (
    <>
      <PageHeader
        title={`${emp.first_name} ${emp.last_name}`}
        description={`${emp.employee_number} · ${emp.payroll_currency} payroll`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/payroll/employees">Back to employees</Link>
          </Button>
        }
      />
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
                    <Select
                      value={salaryDraft.structureId || "none"}
                      onValueChange={(v) =>
                        setSalaryDraft({ ...salaryDraft, structureId: v === "none" ? "" : v })
                      }
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
                    </Select>
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

        <div className="lg:col-span-2">
          <AttachmentsPanel
            entityType="contact"
            entityId={emp.contact_id}
            title="Contact attachments"
          />
        </div>
      </div>
    </>
  );
}
