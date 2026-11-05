import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import type { PayrollRunJournalSummary } from "@/lib/payroll/payments.functions";
import { PAYROLL_PAYMENTS_MIGRATION } from "@/lib/payroll/payments.functions";
import {
  PAYROLL_REPORT_MONETARY_STATUSES,
  PAYROLL_REPORT_POSTED_STATUSES,
} from "@/lib/payroll/payroll-report-scope";
import {
  PAYROLL_REPORT_DEFINITIONS,
  runPayrollReport,
  type PayrollReportEmployeeSlice,
  type PayrollReportFacts,
  type PayrollReportFilters,
  type PayrollReportId,
  type PayrollReportResult,
} from "@/lib/payroll/payroll-reports";
import { PAYROLL_RUNS_MIGRATION } from "@/lib/payroll/runs.functions";
import type {
  PayrollEmployeeRow,
  PayrollPayScheduleRow,
  PayrollPayslipRow,
  PayrollRunEmployeeRow,
  PayrollRunLineRow,
  PayrollRunRow,
} from "@/lib/payroll/types";

export const PAYROLL_REPORTS_MIGRATION = PAYROLL_RUNS_MIGRATION;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pick(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return str(value);
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normaliseRun(raw: unknown): PayrollRunRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    run_number: str(pick(row, "run_number")),
    pay_schedule_id: str(pick(row, "pay_schedule_id")),
    period_start: str(pick(row, "period_start")),
    period_end: str(pick(row, "period_end")),
    payment_date: str(pick(row, "payment_date")),
    status: str(pick(row, "status")) as PayrollRunRow["status"],
    currency: str(pick(row, "currency")),
    gross_minor: num(pick(row, "gross_minor")),
    deductions_minor: num(pick(row, "deductions_minor")),
    net_minor: num(pick(row, "net_minor")),
    employer_minor: num(pick(row, "employer_minor")),
    employer_cost_minor: num(pick(row, "employer_cost_minor")),
    net_paid_minor: num(pick(row, "net_paid_minor")),
    accrual_journal_id: strOrNull(pick(row, "accrual_journal_id")),
    posted_at: strOrNull(pick(row, "posted_at")),
    requires_approval: bool(pick(row, "requires_approval"), true),
    approved_by: strOrNull(pick(row, "approved_by")),
    approved_at: strOrNull(pick(row, "approved_at")),
    calculated_at: strOrNull(pick(row, "calculated_at")),
    reviewed_at: strOrNull(pick(row, "reviewed_at")),
    version: num(pick(row, "version") || 1),
    created_by: strOrNull(pick(row, "created_by")),
    created_at: str(pick(row, "created_at")),
    updated_at: str(pick(row, "updated_at")),
  };
}

function normaliseRunEmployee(raw: unknown): PayrollRunEmployeeRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    run_id: str(pick(row, "run_id")),
    employee_id: str(pick(row, "employee_id")),
    status: str(pick(row, "status")) as PayrollRunEmployeeRow["status"],
    gross_minor: num(pick(row, "gross_minor")),
    deductions_minor: num(pick(row, "deductions_minor")),
    net_minor: num(pick(row, "net_minor")),
    employer_minor: num(pick(row, "employer_minor")),
    employer_cost_minor: num(pick(row, "employer_cost_minor")),
    hours_leave_snapshot: null,
  };
}

function normaliseEmployee(raw: unknown): PayrollEmployeeRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    contact_id: str(pick(row, "contact_id")),
    employee_number: str(pick(row, "employee_number")),
    first_name: str(pick(row, "first_name")),
    last_name: str(pick(row, "last_name")),
    email: strOrNull(pick(row, "email")),
    status: str(pick(row, "status")) as PayrollEmployeeRow["status"],
    hire_date: str(pick(row, "hire_date")),
    termination_date: strOrNull(pick(row, "termination_date")),
    department: strOrNull(pick(row, "department")),
    designation: strOrNull(pick(row, "designation")),
    employment_type: str(pick(row, "employment_type")) as PayrollEmployeeRow["employment_type"],
    work_location: strOrNull(pick(row, "work_location")),
    payroll_country_code: str(pick(row, "payroll_country_code")),
    payroll_currency: str(pick(row, "payroll_currency")),
    pay_schedule_id: strOrNull(pick(row, "pay_schedule_id")),
    salary_structure_id: strOrNull(pick(row, "salary_structure_id")),
    payment_method: str(pick(row, "payment_method")) as PayrollEmployeeRow["payment_method"],
    notes: strOrNull(pick(row, "notes")),
    archived_at: strOrNull(pick(row, "archived_at")),
    created_at: str(pick(row, "created_at")),
    updated_at: str(pick(row, "updated_at")),
  };
}

function normaliseRunLine(raw: unknown): PayrollRunLineRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    run_employee_id: str(pick(row, "run_employee_id")),
    component_type_id: strOrNull(pick(row, "component_type_id")),
    kind: str(pick(row, "kind")) as PayrollRunLineRow["kind"],
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    amount_minor: num(pick(row, "amount_minor")),
    quantity_micro: pick(row, "quantity_micro") == null ? null : num(pick(row, "quantity_micro")),
    rate_minor: pick(row, "rate_minor") == null ? null : num(pick(row, "rate_minor")),
    percentage_bps: pick(row, "percentage_bps") == null ? null : num(pick(row, "percentage_bps")),
    is_employer: bool(pick(row, "is_employer")),
    is_variable: bool(pick(row, "is_variable")),
    sort_order: num(pick(row, "sort_order") || 100),
  };
}

function normalisePayslip(raw: unknown): PayrollPayslipRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    run_id: str(pick(row, "run_id")),
    run_employee_id: str(pick(row, "run_employee_id")),
    employee_id: str(pick(row, "employee_id")),
    payslip_number: str(pick(row, "payslip_number")),
    issued_at: str(pick(row, "issued_at")),
    payment_status: str(pick(row, "payment_status")) as PayrollPayslipRow["payment_status"],
    amount_paid_minor: num(pick(row, "amount_paid_minor")),
    snapshot: pick(row, "snapshot") as PayrollPayslipRow["snapshot"],
    branding_name: strOrNull(pick(row, "branding_name")),
    footer_note: strOrNull(pick(row, "footer_note")),
    show_employer_costs: bool(pick(row, "show_employer_costs")),
  };
}

function normaliseSchedule(raw: unknown): PayrollPayScheduleRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    name: str(pick(row, "name")),
    frequency: str(pick(row, "frequency")) as PayrollPayScheduleRow["frequency"],
    anchor_date: str(pick(row, "anchor_date")),
    payment_offset_days: num(pick(row, "payment_offset_days")),
    is_default: bool(pick(row, "is_default")),
    is_active: bool(pick(row, "is_active"), true),
  };
}

function parseFilters(input: {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string | null;
  department?: string | null;
  payScheduleId?: string | null;
}): PayrollReportFilters {
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  return {
    dateFrom: input.dateFrom?.trim() || yearStart,
    dateTo: input.dateTo?.trim() || today,
    employeeId: input.employeeId?.trim() || null,
    department: input.department?.trim() || null,
    payScheduleId: input.payScheduleId?.trim() || null,
  };
}

function employeeMatchesFilters(
  employee: PayrollEmployeeRow,
  filters: PayrollReportFilters,
): boolean {
  if (filters.employeeId && employee.id !== filters.employeeId) return false;
  if (filters.department) {
    const want = filters.department.toLowerCase();
    const have = (employee.department ?? "").trim().toLowerCase();
    if (have !== want) return false;
  }
  return true;
}

async function probeRuns(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
): Promise<boolean> {
  const probe = await supabase
    .from("payroll_runs" as never)
    .select("id" as never)
    .eq("company_id" as never, companyId as never)
    .limit(1);
  if (probe.error && isMissingRelation(probe.error)) return false;
  if (probe.error) throw new Error(probe.error.message);
  return true;
}

async function loadRunJournals(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  runId: string,
): Promise<PayrollRunJournalSummary[]> {
  try {
    const raw = await callRpc<unknown>(
      supabase,
      "list_payroll_run_journals",
      { _company_id: companyId, _run_id: runId },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(raw);
    const journals = pick(payload, "journals");
    if (!Array.isArray(journals)) return [];
    return journals.map((item) => {
      const bundle = asRecord(item);
      const journal = asRecord(pick(bundle, "journal"));
      const linesRaw = pick(bundle, "lines");
      const lines = Array.isArray(linesRaw)
        ? linesRaw.map((lineItem) => {
            const lr = asRecord(lineItem);
            const line = asRecord(pick(lr, "line"));
            return {
              account_code: str(pick(lr, "account_code")),
              account_name: str(pick(lr, "account_name")),
              debit_minor: num(pick(line, "debit_minor")),
              credit_minor: num(pick(line, "credit_minor")),
              description: strOrNull(pick(line, "description")),
            };
          })
        : [];
      return {
        id: str(pick(journal, "id")),
        journal_number: num(pick(journal, "journal_number")),
        journal_date: str(pick(journal, "journal_date")),
        memo: strOrNull(pick(journal, "memo")),
        source_type: str(pick(journal, "source_type")),
        lines,
      };
    });
  } catch {
    return [];
  }
}

async function buildReportFacts(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  filters: PayrollReportFilters,
  reportId: PayrollReportId,
): Promise<PayrollReportFacts> {
  const statuses =
    reportId === "payroll_journal_reconciliation"
      ? [...PAYROLL_REPORT_POSTED_STATUSES]
      : [...PAYROLL_REPORT_MONETARY_STATUSES];

  let runQuery = supabase
    .from("payroll_runs" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("status" as never, statuses as never)
    .gte("period_end" as never, filters.dateFrom as never)
    .lte("period_end" as never, filters.dateTo as never);

  if (filters.payScheduleId) {
    runQuery = runQuery.eq("pay_schedule_id" as never, filters.payScheduleId as never);
  }

  const runsRes = await runQuery;
  if (runsRes.error) throw new Error(runsRes.error.message);
  const runs = (runsRes.data ?? []).map(normaliseRun);
  if (runs.length === 0) {
    return {
      currency: "GBP",
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      slices: [],
      linesByRunEmployeeId: new Map(),
      journalsByRunId: new Map(),
    };
  }

  const runIds = runs.map((r) => r.id);
  const scheduleIds = [...new Set(runs.map((r) => r.pay_schedule_id))];
  const schedulesRes = await supabase
    .from("payroll_pay_schedules" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("id" as never, scheduleIds as never);
  if (schedulesRes.error) throw new Error(schedulesRes.error.message);
  const scheduleNames = new Map(
    (schedulesRes.data ?? []).map((raw) => {
      const s = normaliseSchedule(raw);
      return [s.id, s.name] as const;
    }),
  );

  const reRes = await supabase
    .from("payroll_run_employees" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("run_id" as never, runIds as never);
  if (reRes.error) throw new Error(reRes.error.message);
  const runEmployees = (reRes.data ?? []).map(normaliseRunEmployee);

  const employeeIds = [...new Set(runEmployees.map((re) => re.employee_id))];
  const empRes = await supabase
    .from("payroll_employees" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("id" as never, employeeIds as never);
  if (empRes.error) throw new Error(empRes.error.message);
  const employeesById = new Map(
    (empRes.data ?? []).map((raw) => {
      const e = normaliseEmployee(raw);
      return [e.id, e] as const;
    }),
  );

  const runById = new Map(runs.map((r) => [r.id, r] as const));
  const slices: PayrollReportEmployeeSlice[] = [];
  for (const re of runEmployees) {
    const employee = employeesById.get(re.employee_id);
    const run = runById.get(re.run_id);
    if (!employee || !run) continue;
    if (!employeeMatchesFilters(employee, filters)) continue;
    slices.push({
      run,
      runEmployee: re,
      employee,
      payslip: null,
      scheduleName: scheduleNames.get(run.pay_schedule_id) ?? "",
    });
  }

  const reIds = slices.map((s) => s.runEmployee.id);
  const linesByRunEmployeeId = new Map<string, PayrollRunLineRow[]>();
  if (reIds.length > 0) {
    const linesRes = await supabase
      .from("payroll_run_lines" as never)
      .select("*" as never)
      .eq("company_id" as never, companyId as never)
      .in("run_employee_id" as never, reIds as never);
    if (linesRes.error) throw new Error(linesRes.error.message);
    for (const raw of linesRes.data ?? []) {
      const line = normaliseRunLine(raw);
      const bucket = linesByRunEmployeeId.get(line.run_employee_id) ?? [];
      bucket.push(line);
      linesByRunEmployeeId.set(line.run_employee_id, bucket);
    }
  }

  const payslipRes = await supabase
    .from("payroll_payslips" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("run_id" as never, runIds as never);
  if (payslipRes.error) throw new Error(payslipRes.error.message);
  const payslipByRunEmployee = new Map<string, PayrollPayslipRow>();
  for (const raw of payslipRes.data ?? []) {
    const p = normalisePayslip(raw);
    payslipByRunEmployee.set(p.run_employee_id, p);
  }
  for (const slice of slices) {
    slice.payslip = payslipByRunEmployee.get(slice.runEmployee.id) ?? null;
  }

  const journalsByRunId = new Map<string, PayrollRunJournalSummary[]>();
  if (reportId === "payroll_journal_reconciliation") {
    const postedRunIds = [...new Set(slices.map((s) => s.run.id))];
    await Promise.all(
      postedRunIds.map(async (runId) => {
        const run = runById.get(runId);
        if (!run?.accrual_journal_id) return;
        const journals = await loadRunJournals(supabase, companyId, runId);
        journalsByRunId.set(runId, journals);
      }),
    );
  }

  const currency = runs[0]?.currency ?? slices[0]?.employee.payroll_currency ?? "GBP";

  return {
    currency,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    slices,
    linesByRunEmployeeId,
    journalsByRunId,
  };
}

export const getPayrollReportsCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: companyIdOf(input),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.reports.view");
    const ok = await probeRuns(context.supabase, data.companyId);
    if (!ok) {
      return {
        available: false as const,
        reports: PAYROLL_REPORT_DEFINITIONS,
        schedules: [] as PayrollPayScheduleRow[],
        employees: [] as PayrollEmployeeRow[],
        migrationMessage: PAYROLL_REPORTS_MIGRATION,
      };
    }

    const [schedulesRes, employeesRes] = await Promise.all([
      context.supabase
        .from("payroll_pay_schedules" as never)
        .select("*" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("is_active" as never, true as never)
        .order("name" as never),
      context.supabase
        .from("payroll_employees" as never)
        .select("*" as never)
        .eq("company_id" as never, data.companyId as never)
        .order("employee_number" as never),
    ]);
    if (schedulesRes.error) throw new Error(schedulesRes.error.message);
    if (employeesRes.error) throw new Error(employeesRes.error.message);

    return {
      available: true as const,
      reports: PAYROLL_REPORT_DEFINITIONS,
      schedules: (schedulesRes.data ?? []).map(normaliseSchedule),
      employees: (employeesRes.data ?? []).map(normaliseEmployee),
      migrationMessage: null as string | null,
    };
  });

export const runPayrollReportServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      reportId: PayrollReportId;
      dateFrom?: string;
      dateTo?: string;
      employeeId?: string | null;
      department?: string | null;
      payScheduleId?: string | null;
    }) => ({
      companyId: companyIdOf(input),
      reportId: input.reportId,
      filters: parseFilters(input),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.reports.view");
    const ok = await probeRuns(context.supabase, data.companyId);
    if (!ok) {
      return {
        available: false as const,
        result: null as PayrollReportResult | null,
        migrationMessage: PAYROLL_REPORTS_MIGRATION,
      };
    }

    const facts = await buildReportFacts(
      context.supabase,
      data.companyId,
      data.filters,
      data.reportId,
    );
    const result = runPayrollReport(data.reportId, facts);
    return {
      available: true as const,
      result,
      migrationMessage: null as string | null,
    };
  });
