import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  getPayrollSettingsPage,
  savePayrollComponentType,
  savePayrollDocumentSequences,
  savePayrollPaySchedule,
  savePayrollSettings,
} from "@/lib/payroll/payroll.functions";
import {
  assertPaymentMethod,
  assertRoundingMode,
  parseComponentDraft,
  parsePayScheduleDraft,
  parsePayrollSettingsDraft,
  type PayrollSettingsDraft,
} from "@/lib/payroll/settings-draft";
import {
  CALCULATION_METHODS,
  COMPONENT_KINDS,
  PAYMENT_METHODS,
  PAY_FREQUENCIES,
  PERCENTAGE_BASES,
  ROUNDING_MODES,
  type PayrollComponentTypeRow,
  type PayrollPayScheduleRow,
} from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { AccountLookup } from "@/components/lookup";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function emptySettingsDraft(country: string, currency: string): PayrollSettingsDraft {
  return {
    enabled: false,
    operatingCountryCode: country,
    payrollCurrency: currency,
    defaultPayScheduleId: "",
    payrollStartDate: "",
    defaultWorkingDaysPerWeek: "5",
    defaultWorkingHoursPerDay: "8",
    paymentDateOffsetDays: "0",
    salaryExpenseAccountId: "",
    netPayLiabilityAccountId: "",
    deductionLiabilityAccountId: "",
    employerExpenseAccountId: "",
    employerLiabilityAccountId: "",
    defaultPaymentMethod: "bank_transfer",
    requiresApproval: true,
    roundingMode: "half_up",
    payslipShowEmployerCosts: false,
    payslipFooterNote: "",
    payslipBrandingName: "",
    employeeNumberPrefix: "EMP-",
    disclaimerAcknowledged: false,
    version: null,
  };
}

export function PayrollSettingsPage() {
  const uiId = useId();
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canEdit = useCanDo("payroll.settings.edit");
  const queryClient = useQueryClient();
  const fetchPage = useServerFn(getPayrollSettingsPage);
  const saveSettings = useServerFn(savePayrollSettings);
  const saveSchedule = useServerFn(savePayrollPaySchedule);
  const saveComponent = useServerFn(savePayrollComponentType);
  const saveSequences = useServerFn(savePayrollDocumentSequences);

  const page = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchPage({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const [draft, setDraft] = useState<PayrollSettingsDraft | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState({
    name: "Monthly",
    frequency: "monthly",
    anchorDate: new Date().toISOString().slice(0, 10),
    paymentOffsetDays: "0",
    isDefault: true,
    isActive: true,
  });
  const [componentDraft, setComponentDraft] = useState({
    code: "",
    name: "",
    kind: "earning",
    calculationMethod: "fixed",
    percentageBase: "gross",
    isTaxable: true,
    isRecurringDefault: true,
    isActive: true,
    sortOrder: "200",
    expenseAccountId: "",
    liabilityAccountId: "",
  });
  const [seqDraft, setSeqDraft] = useState({
    payrollRunPrefix: "PR-",
    payslipPrefix: "PS-",
    payrollRunNext: "1",
    payslipNext: "1",
    payrollRunPadding: "4",
    payslipPadding: "4",
  });

  useEffect(() => {
    if (!page.data) return;
    const settings = page.data.settings;
    setDraft(
      settings
        ? {
            enabled: settings.enabled,
            operatingCountryCode: settings.operating_country_code,
            payrollCurrency: settings.payroll_currency,
            defaultPayScheduleId: settings.default_pay_schedule_id ?? "",
            payrollStartDate: settings.payroll_start_date ?? "",
            defaultWorkingDaysPerWeek: String(settings.default_working_days_per_week),
            defaultWorkingHoursPerDay: String(settings.default_working_hours_per_day),
            paymentDateOffsetDays: String(settings.payment_date_offset_days),
            salaryExpenseAccountId: settings.salary_expense_account_id ?? "",
            netPayLiabilityAccountId: settings.net_pay_liability_account_id ?? "",
            deductionLiabilityAccountId: settings.deduction_liability_account_id ?? "",
            employerExpenseAccountId: settings.employer_expense_account_id ?? "",
            employerLiabilityAccountId: settings.employer_liability_account_id ?? "",
            defaultPaymentMethod: assertPaymentMethod(settings.default_payment_method),
            requiresApproval: settings.requires_approval,
            roundingMode: assertRoundingMode(settings.rounding_mode),
            payslipShowEmployerCosts: settings.payslip_show_employer_costs,
            payslipFooterNote: settings.payslip_footer_note ?? "",
            payslipBrandingName: settings.payslip_branding_name ?? "",
            employeeNumberPrefix: settings.employee_number_prefix,
            disclaimerAcknowledged: settings.disclaimer_acknowledged,
            version: settings.version,
          }
        : emptySettingsDraft(page.data.company.country_code, page.data.company.base_currency),
    );
    const run = page.data.sequences.find((s) => s.document_type === "payroll_run");
    const slip = page.data.sequences.find((s) => s.document_type === "payslip");
    setSeqDraft({
      payrollRunPrefix: run?.prefix ?? "PR-",
      payslipPrefix: slip?.prefix ?? "PS-",
      payrollRunNext: String(run?.next_number ?? 1),
      payslipNext: String(slip?.next_number ?? 1),
      payrollRunPadding: String(run?.padding ?? 4),
      payslipPadding: String(slip?.padding ?? 4),
    });
  }, [page.data]);

  const expenseAccounts = useMemo(
    () => (page.data?.accounts ?? []).filter((a) => a.account_type === "expense"),
    [page.data?.accounts],
  );
  const liabilityAccounts = useMemo(
    () => (page.data?.accounts ?? []).filter((a) => a.account_type === "liability"),
    [page.data?.accounts],
  );

  const settingsMut = useMutation({
    mutationFn: () => {
      if (!company || !draft) throw new Error("Settings are not ready.");
      const parsed = parsePayrollSettingsDraft(draft);
      if (!parsed.ok) throw new Error(parsed.error);
      return saveSettings({ data: { companyId: company.id, draft } });
    },
    onSuccess: async () => {
      toast.success("Payroll settings saved");
      await queryClient.invalidateQueries({ queryKey: ["payroll-settings-page", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const scheduleMut = useMutation({
    mutationFn: () => {
      if (!company) throw new Error("No organisation selected.");
      const parsed = parsePayScheduleDraft(scheduleDraft);
      if (!parsed.ok) throw new Error(parsed.error);
      return saveSchedule({ data: { companyId: company.id, draft: scheduleDraft } });
    },
    onSuccess: async () => {
      toast.success("Pay schedule saved");
      await queryClient.invalidateQueries({ queryKey: ["payroll-settings-page", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const componentMut = useMutation({
    mutationFn: () => {
      if (!company) throw new Error("No organisation selected.");
      const parsed = parseComponentDraft(componentDraft);
      if (!parsed.ok) throw new Error(parsed.error);
      return saveComponent({ data: { companyId: company.id, draft: componentDraft } });
    },
    onSuccess: async () => {
      toast.success("Pay component saved");
      setComponentDraft((prev) => ({ ...prev, code: "", name: "" }));
      await queryClient.invalidateQueries({ queryKey: ["payroll-settings-page", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const sequenceMut = useMutation({
    mutationFn: () => {
      if (!company) throw new Error("No organisation selected.");
      return saveSequences({
        data: {
          companyId: company.id,
          payrollRunPrefix: seqDraft.payrollRunPrefix,
          payslipPrefix: seqDraft.payslipPrefix,
          payrollRunNext: Number(seqDraft.payrollRunNext),
          payslipNext: Number(seqDraft.payslipNext),
          payrollRunPadding: Number(seqDraft.payrollRunPadding),
          payslipPadding: Number(seqDraft.payslipPadding),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Payroll numbering saved");
      await queryClient.invalidateQueries({ queryKey: ["payroll-settings-page", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Payroll settings" description="Organisation payroll configuration." />
        <EmptyState
          title="No payroll access"
          description="Ask an organisation administrator for the payroll.view permission."
        />
      </>
    );
  }
  if (page.isPending || !draft) return <LoadingState />;
  if (page.isError) {
    return (
      <ErrorState
        title="Could not load payroll settings"
        description={friendlyAuthError(page.error)}
        onRetry={() => page.refetch()}
      />
    );
  }

  const data = page.data;
  const parsedSettings = parsePayrollSettingsDraft(draft);

  return (
    <>
      <PageHeader
        title="Payroll settings"
        description="Enable Basic Global Payroll, configure schedules, accounts, numbering and components."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/payroll">Back to overview</Link>
          </Button>
        }
      />
      <PayrollSubnav current="settings" />

      {!data.available ? (
        <Alert>
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{data.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          <Alert>
            <AlertTitle>Basic Payroll compliance notice</AlertTitle>
            <AlertDescription>{data.disclaimer}</AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">General</CardTitle>
              <CardDescription>
                Uses the organisation country and base currency by default. Statutory tax engines
                are not included in Basic Payroll.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 md:col-span-2">
                <div>
                  <Label htmlFor={`${uiId}-enabled`}>Enable Basic Payroll</Label>
                  <p className="text-xs text-muted-foreground">
                    Turn on only after accounts, schedules and the disclaimer are complete.
                  </p>
                </div>
                <Switch
                  id={`${uiId}-enabled`}
                  checked={draft.enabled}
                  disabled={!canEdit}
                  onCheckedChange={(enabled) =>
                    setDraft((prev) => (prev ? { ...prev, enabled } : prev))
                  }
                />
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3 md:col-span-2">
                <Switch
                  id={`${uiId}-disclaimer`}
                  checked={draft.disclaimerAcknowledged}
                  disabled={!canEdit}
                  onCheckedChange={(disclaimerAcknowledged) =>
                    setDraft((prev) => (prev ? { ...prev, disclaimerAcknowledged } : prev))
                  }
                />
                <Label htmlFor={`${uiId}-disclaimer`} className="text-sm font-normal leading-5">
                  I understand Basic Payroll does not automatically calculate statutory tax or
                  social contributions and is not advertised as legally compliant in every country.
                </Label>
              </div>
              <Field label="Operating country" htmlFor={`${uiId}-country`}>
                <Input
                  id={`${uiId}-country`}
                  value={draft.operatingCountryCode}
                  disabled={!canEdit}
                  maxLength={2}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, operatingCountryCode: e.target.value.toUpperCase() } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Payroll currency" htmlFor={`${uiId}-currency`}>
                <Input
                  id={`${uiId}-currency`}
                  value={draft.payrollCurrency}
                  disabled={!canEdit}
                  maxLength={3}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, payrollCurrency: e.target.value.toUpperCase() } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Payroll start date" htmlFor={`${uiId}-start`}>
                <Input
                  id={`${uiId}-start`}
                  type="date"
                  value={draft.payrollStartDate}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, payrollStartDate: e.target.value } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Default pay schedule" htmlFor={`${uiId}-schedule`}>
                <select
                  id={`${uiId}-schedule`}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.defaultPayScheduleId}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, defaultPayScheduleId: e.target.value } : prev,
                    )
                  }
                >
                  <option value="">Not set</option>
                  {data.schedules
                    .filter((schedule) => schedule.is_active)
                    .map((schedule) => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.name} ({schedule.frequency})
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Default working days / week" htmlFor={`${uiId}-days`}>
                <Input
                  id={`${uiId}-days`}
                  inputMode="decimal"
                  value={draft.defaultWorkingDaysPerWeek}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, defaultWorkingDaysPerWeek: e.target.value } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Default working hours / day" htmlFor={`${uiId}-hours`}>
                <Input
                  id={`${uiId}-hours`}
                  inputMode="decimal"
                  value={draft.defaultWorkingHoursPerDay}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, defaultWorkingHoursPerDay: e.target.value } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Payment date offset (days after period end)" htmlFor={`${uiId}-offset`}>
                <Input
                  id={`${uiId}-offset`}
                  inputMode="numeric"
                  value={draft.paymentDateOffsetDays}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, paymentDateOffsetDays: e.target.value } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Default payment method" htmlFor={`${uiId}-method`}>
                <select
                  id={`${uiId}-method`}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.defaultPaymentMethod}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? { ...prev, defaultPaymentMethod: assertPaymentMethod(e.target.value) }
                        : prev,
                    )
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rounding mode" htmlFor={`${uiId}-rounding`}>
                <select
                  id={`${uiId}-rounding`}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.roundingMode}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, roundingMode: assertRoundingMode(e.target.value) } : prev,
                    )
                  }
                >
                  {ROUNDING_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label htmlFor={`${uiId}-approval`}>Require payroll approval before posting</Label>
                <Switch
                  id={`${uiId}-approval`}
                  checked={draft.requiresApproval}
                  disabled={!canEdit}
                  onCheckedChange={(requiresApproval) =>
                    setDraft((prev) => (prev ? { ...prev, requiresApproval } : prev))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Default payroll accounts</CardTitle>
              <CardDescription>
                Posted payroll journals will use these Chart of Accounts mappings in later batches.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <AccountField
                label="Default salary expense"
                companyId={company.id}
                accounts={expenseAccounts}
                value={draft.salaryExpenseAccountId}
                disabled={!canEdit}
                onChange={(salaryExpenseAccountId) =>
                  setDraft((prev) => (prev ? { ...prev, salaryExpenseAccountId } : prev))
                }
              />
              <AccountField
                label="Net salaries payable"
                companyId={company.id}
                accounts={liabilityAccounts}
                value={draft.netPayLiabilityAccountId}
                disabled={!canEdit}
                onChange={(netPayLiabilityAccountId) =>
                  setDraft((prev) => (prev ? { ...prev, netPayLiabilityAccountId } : prev))
                }
              />
              <AccountField
                label="Employee deduction liabilities"
                companyId={company.id}
                accounts={liabilityAccounts}
                value={draft.deductionLiabilityAccountId}
                disabled={!canEdit}
                onChange={(deductionLiabilityAccountId) =>
                  setDraft((prev) => (prev ? { ...prev, deductionLiabilityAccountId } : prev))
                }
              />
              <AccountField
                label="Employer contribution expense"
                companyId={company.id}
                accounts={expenseAccounts}
                value={draft.employerExpenseAccountId}
                disabled={!canEdit}
                onChange={(employerExpenseAccountId) =>
                  setDraft((prev) => (prev ? { ...prev, employerExpenseAccountId } : prev))
                }
              />
              <AccountField
                label="Employer contribution liabilities"
                companyId={company.id}
                accounts={liabilityAccounts}
                value={draft.employerLiabilityAccountId}
                disabled={!canEdit}
                onChange={(employerLiabilityAccountId) =>
                  setDraft((prev) => (prev ? { ...prev, employerLiabilityAccountId } : prev))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payslip branding and employee numbering</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Payslip branding name" htmlFor={`${uiId}-brand`}>
                <Input
                  id={`${uiId}-brand`}
                  value={draft.payslipBrandingName}
                  disabled={!canEdit}
                  placeholder={data.company.name}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, payslipBrandingName: e.target.value } : prev,
                    )
                  }
                />
              </Field>
              <Field label="Employee number prefix" htmlFor={`${uiId}-emp-prefix`}>
                <Input
                  id={`${uiId}-emp-prefix`}
                  value={draft.employeeNumberPrefix}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, employeeNumberPrefix: e.target.value } : prev,
                    )
                  }
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Payslip footer note" htmlFor={`${uiId}-footer`}>
                  <Textarea
                    id={`${uiId}-footer`}
                    value={draft.payslipFooterNote}
                    disabled={!canEdit}
                    rows={3}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev ? { ...prev, payslipFooterNote: e.target.value } : prev,
                      )
                    }
                  />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 md:col-span-2">
                <Label htmlFor={`${uiId}-show-er`}>Show employer contributions on payslips</Label>
                <Switch
                  id={`${uiId}-show-er`}
                  checked={draft.payslipShowEmployerCosts}
                  disabled={!canEdit}
                  onCheckedChange={(payslipShowEmployerCosts) =>
                    setDraft((prev) => (prev ? { ...prev, payslipShowEmployerCosts } : prev))
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                {!parsedSettings.ok ? (
                  <p className="text-sm text-destructive">{parsedSettings.error}</p>
                ) : null}
                <Button
                  type="button"
                  disabled={!canEdit || !parsedSettings.ok || settingsMut.isPending}
                  onClick={() => settingsMut.mutate()}
                >
                  Save payroll settings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pay schedules</CardTitle>
              <CardDescription>
                Weekly, biweekly, semimonthly and monthly schedules are supported.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScheduleTable schedules={data.schedules} />
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Name" htmlFor={`${uiId}-sched-name`}>
                  <Input
                    id={`${uiId}-sched-name`}
                    value={scheduleDraft.name}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setScheduleDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Frequency" htmlFor={`${uiId}-sched-freq`}>
                  <select
                    id={`${uiId}-sched-freq`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={scheduleDraft.frequency}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setScheduleDraft((prev) => ({ ...prev, frequency: e.target.value }))
                    }
                  >
                    {PAY_FREQUENCIES.map((frequency) => (
                      <option key={frequency} value={frequency}>
                        {frequency}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Anchor / period start date" htmlFor={`${uiId}-sched-anchor`}>
                  <Input
                    id={`${uiId}-sched-anchor`}
                    type="date"
                    value={scheduleDraft.anchorDate}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setScheduleDraft((prev) => ({ ...prev, anchorDate: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Payment offset days" htmlFor={`${uiId}-sched-offset`}>
                  <Input
                    id={`${uiId}-sched-offset`}
                    inputMode="numeric"
                    value={scheduleDraft.paymentOffsetDays}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setScheduleDraft((prev) => ({ ...prev, paymentOffsetDays: e.target.value }))
                    }
                  />
                </Field>
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <Label htmlFor={`${uiId}-sched-default`}>Set as default</Label>
                  <Switch
                    id={`${uiId}-sched-default`}
                    checked={scheduleDraft.isDefault}
                    disabled={!canEdit}
                    onCheckedChange={(isDefault) =>
                      setScheduleDraft((prev) => ({ ...prev, isDefault }))
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canEdit || scheduleMut.isPending}
                onClick={() => scheduleMut.mutate()}
              >
                Add pay schedule
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payroll and payslip numbering</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Field label="Payroll run prefix" htmlFor={`${uiId}-pr-prefix`}>
                <Input
                  id={`${uiId}-pr-prefix`}
                  value={seqDraft.payrollRunPrefix}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSeqDraft((prev) => ({ ...prev, payrollRunPrefix: e.target.value }))
                  }
                />
              </Field>
              <Field label="Next run number" htmlFor={`${uiId}-pr-next`}>
                <Input
                  id={`${uiId}-pr-next`}
                  inputMode="numeric"
                  value={seqDraft.payrollRunNext}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSeqDraft((prev) => ({ ...prev, payrollRunNext: e.target.value }))
                  }
                />
              </Field>
              <Field label="Run padding" htmlFor={`${uiId}-pr-pad`}>
                <Input
                  id={`${uiId}-pr-pad`}
                  inputMode="numeric"
                  value={seqDraft.payrollRunPadding}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSeqDraft((prev) => ({ ...prev, payrollRunPadding: e.target.value }))
                  }
                />
              </Field>
              <Field label="Payslip prefix" htmlFor={`${uiId}-ps-prefix`}>
                <Input
                  id={`${uiId}-ps-prefix`}
                  value={seqDraft.payslipPrefix}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSeqDraft((prev) => ({ ...prev, payslipPrefix: e.target.value }))
                  }
                />
              </Field>
              <Field label="Next payslip number" htmlFor={`${uiId}-ps-next`}>
                <Input
                  id={`${uiId}-ps-next`}
                  inputMode="numeric"
                  value={seqDraft.payslipNext}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSeqDraft((prev) => ({ ...prev, payslipNext: e.target.value }))
                  }
                />
              </Field>
              <Field label="Payslip padding" htmlFor={`${uiId}-ps-pad`}>
                <Input
                  id={`${uiId}-ps-pad`}
                  inputMode="numeric"
                  value={seqDraft.payslipPadding}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setSeqDraft((prev) => ({ ...prev, payslipPadding: e.target.value }))
                  }
                />
              </Field>
              <div className="md:col-span-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || sequenceMut.isPending}
                  onClick={() => sequenceMut.mutate()}
                >
                  Save numbering
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Earnings and deductions catalogue</CardTitle>
              <CardDescription>
                Configurable components for later salary structures. Manual tax and social items are
                included for external statutory amounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ComponentTable components={data.components} />
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Code" htmlFor={`${uiId}-comp-code`}>
                  <Input
                    id={`${uiId}-comp-code`}
                    value={componentDraft.code}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setComponentDraft((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                  />
                </Field>
                <Field label="Name" htmlFor={`${uiId}-comp-name`}>
                  <Input
                    id={`${uiId}-comp-name`}
                    value={componentDraft.name}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setComponentDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Kind" htmlFor={`${uiId}-comp-kind`}>
                  <select
                    id={`${uiId}-comp-kind`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={componentDraft.kind}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setComponentDraft((prev) => ({ ...prev, kind: e.target.value }))
                    }
                  >
                    {COMPONENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Calculation" htmlFor={`${uiId}-comp-calc`}>
                  <select
                    id={`${uiId}-comp-calc`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={componentDraft.calculationMethod}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setComponentDraft((prev) => ({
                        ...prev,
                        calculationMethod: e.target.value,
                      }))
                    }
                  >
                    {CALCULATION_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </Field>
                {componentDraft.calculationMethod === "percentage" ? (
                  <Field label="Percentage base" htmlFor={`${uiId}-comp-base`}>
                    <select
                      id={`${uiId}-comp-base`}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={componentDraft.percentageBase}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setComponentDraft((prev) => ({
                          ...prev,
                          percentageBase: e.target.value,
                        }))
                      }
                    >
                      {PERCENTAGE_BASES.map((base) => (
                        <option key={base} value={base}>
                          {base.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Sort order" htmlFor={`${uiId}-comp-sort`}>
                  <Input
                    id={`${uiId}-comp-sort`}
                    inputMode="numeric"
                    value={componentDraft.sortOrder}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setComponentDraft((prev) => ({ ...prev, sortOrder: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canEdit || componentMut.isPending}
                onClick={() => componentMut.mutate()}
              >
                Add custom component
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payroll data access</CardTitle>
              <CardDescription>
                Access is enforced by organisation permissions and row-level security. Configure
                member roles under Users & Security.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Batch 1 permissions: <code>payroll.view</code>, <code>payroll.settings.edit</code>,
                plus reserved keys for employees, runs, payments and reports.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings" search={{ section: "users" }}>
                  Open users and security
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function AccountField({
  label,
  companyId,
  accounts,
  value,
  disabled,
  onChange,
}: {
  label: string;
  companyId: string;
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
    is_active: boolean;
    is_postable: boolean;
  }>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <AccountLookup
        companyId={companyId}
        accounts={accounts}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        allowClear
        disabled={disabled}
        ariaLabel={label}
        purpose="posting"
      />
    </div>
  );
}

function ScheduleTable({ schedules }: { schedules: PayrollPayScheduleRow[] }) {
  if (schedules.length === 0) {
    return <p className="text-sm text-muted-foreground">No pay schedules yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Frequency</th>
            <th className="px-3 py-2 font-medium">Anchor</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((schedule) => (
            <tr key={schedule.id} className="border-t">
              <td className="px-3 py-2">
                {schedule.name}
                {schedule.is_default ? (
                  <Badge className="ml-2" variant="secondary">
                    Default
                  </Badge>
                ) : null}
              </td>
              <td className="px-3 py-2 capitalize">{schedule.frequency}</td>
              <td className="px-3 py-2">{schedule.anchor_date}</td>
              <td className="px-3 py-2">{schedule.is_active ? "Active" : "Inactive"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentTable({ components }: { components: PayrollComponentTypeRow[] }) {
  if (components.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Default earnings and deductions are created when settings are first saved.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Code</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Method</th>
            <th className="px-3 py-2 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {components.map((component) => (
            <tr key={component.id} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{component.code}</td>
              <td className="px-3 py-2">{component.name}</td>
              <td className="px-3 py-2 capitalize">{component.kind.replaceAll("_", " ")}</td>
              <td className="px-3 py-2">{component.calculation_method}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {component.is_system ? <Badge variant="outline">System</Badge> : null}
                  {!component.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                  {component.is_recurring_default ? (
                    <Badge variant="secondary">Recurring</Badge>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
