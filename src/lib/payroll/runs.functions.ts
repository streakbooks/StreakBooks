import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import {
  computeRunCalculation,
  serialiseRunCalculationForRpc,
} from "@/lib/payroll/run-calculation";
import { assertRoundingMode } from "@/lib/payroll/settings-draft";
import type { PayslipSnapshot } from "@/lib/payroll/payslip-snapshot";
import type {
  PayrollEmployeeRow,
  PayrollEmployeeSalaryLineRow,
  PayrollComponentTypeRow,
  PayrollPayslipPage,
  PayrollPayslipsListPage,
  PayrollPayScheduleRow,
  PayrollPayslipRow,
  PayrollRunEmployeeRow,
  PayrollRunLineRow,
  PayrollPaymentSummaryRow,
  PayrollRunPage,
  PayrollRunRow,
  PayrollRunsListPage,
} from "@/lib/payroll/types";

export const PAYROLL_RUNS_MIGRATION =
  "Basic Global Payroll runs are not available yet: the database update 20261105173000 has not been applied.";

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
  const snap = pick(row, "hours_leave_snapshot");
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
    hours_leave_snapshot:
      snap && typeof snap === "object"
        ? (snap as PayrollRunEmployeeRow["hours_leave_snapshot"])
        : null,
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

function normalisePayslip(raw: unknown): PayrollPayslipRow {
  const row = asRecord(raw);
  const snap = pick(row, "snapshot");
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
    snapshot: (snap && typeof snap === "object" ? snap : { version: 1 }) as PayslipSnapshot,
    branding_name: strOrNull(pick(row, "branding_name")),
    footer_note: strOrNull(pick(row, "footer_note")),
    show_employer_costs: bool(pick(row, "show_employer_costs")),
  };
}

function normaliseSchedule(raw: unknown): PayrollPayScheduleRow | null {
  if (!raw || typeof raw !== "object") return null;
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

async function probeRunsTable(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
): Promise<PayrollRunsListPage | null> {
  const probe = await supabase
    .from("payroll_runs" as never)
    .select("id" as never)
    .eq("company_id" as never, companyId as never)
    .limit(1);
  if (probe.error && isMissingRelation(probe.error)) {
    return { available: false, runs: [], migrationMessage: PAYROLL_RUNS_MIGRATION };
  }
  if (probe.error) throw new Error(probe.error.message);
  return null;
}

async function loadRunCalculationInputs(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  run: PayrollRunRow,
  runEmployees: PayrollRunEmployeeRow[],
) {
  const settingsRes = await supabase
    .from("payroll_settings" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  const settingsRow = settingsRes.data as Record<string, unknown> | null;
  if (!settingsRow) throw new Error("Configure payroll settings first.");

  const componentsRes = await supabase
    .from("payroll_component_types" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .eq("is_active" as never, true as never);
  if (componentsRes.error) throw new Error(componentsRes.error.message);
  const components = (componentsRes.data ?? []).map((raw) => {
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      company_id: str(pick(row, "company_id")),
      code: str(pick(row, "code")),
      name: str(pick(row, "name")),
      kind: str(pick(row, "kind")) as PayrollComponentTypeRow["kind"],
      calculation_method: str(
        pick(row, "calculation_method"),
      ) as PayrollComponentTypeRow["calculation_method"],
      percentage_base: strOrNull(
        pick(row, "percentage_base"),
      ) as PayrollComponentTypeRow["percentage_base"],
      is_taxable: bool(pick(row, "is_taxable"), true),
      is_recurring_default: bool(pick(row, "is_recurring_default"), true),
      is_system: bool(pick(row, "is_system")),
      is_active: bool(pick(row, "is_active"), true),
      sort_order: num(pick(row, "sort_order") || 100),
      expense_account_id: strOrNull(pick(row, "expense_account_id")),
      liability_account_id: strOrNull(pick(row, "liability_account_id")),
    } satisfies PayrollComponentTypeRow;
  });

  const employeeIds = runEmployees.map((re) => re.employee_id);
  const employeesRes = await supabase
    .from("payroll_employees" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("id" as never, employeeIds as never);
  if (employeesRes.error) throw new Error(employeesRes.error.message);
  const employees = (employeesRes.data ?? []).map(normaliseEmployee);

  const linesRes = await supabase
    .from("payroll_employee_salary_lines" as never)
    .select("*" as never)
    .eq("company_id" as never, companyId as never)
    .in("employee_id" as never, employeeIds as never);
  if (linesRes.error) throw new Error(linesRes.error.message);
  const allSalaryLines = (linesRes.data ?? []).map((raw) => {
    const row = asRecord(raw);
    return {
      id: str(pick(row, "id")),
      company_id: str(pick(row, "company_id")),
      employee_id: str(pick(row, "employee_id")),
      version_id: str(pick(row, "version_id")),
      component_type_id: str(pick(row, "component_type_id")),
      amount_minor: num(pick(row, "amount_minor")),
      rate_minor: num(pick(row, "rate_minor")),
      percentage_bps: num(pick(row, "percentage_bps")),
      is_recurring: bool(pick(row, "is_recurring"), true),
      effective_from: str(pick(row, "effective_from")),
      effective_to: strOrNull(pick(row, "effective_to")),
      notes: strOrNull(pick(row, "notes")),
    } satisfies PayrollEmployeeSalaryLineRow;
  });

  return {
    roundingMode: assertRoundingMode(str(pick(settingsRow, "rounding_mode") || "half_up")),
    workingDaysPerWeek: num(pick(settingsRow, "default_working_days_per_week") || 5),
    workingHoursPerDay: num(pick(settingsRow, "default_working_hours_per_day") || 8),
    currencyCode: str(pick(settingsRow, "payroll_currency") || run.currency),
    components,
    employees,
    allSalaryLines,
  };
}

async function computeAndPersistRun(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
  runId: string,
  rpcName: "calculate_payroll_run" | "recalculate_payroll_run",
) {
  const pageRaw = await callRpc<unknown>(
    supabase,
    "get_payroll_run_page",
    { _company_id: companyId, _run_id: runId },
    PAYROLL_RUNS_MIGRATION,
  );
  const page = asRecord(pageRaw);
  const run = normaliseRun(pick(page, "run"));
  const employeesPayload = pick(page, "employees");
  const runEmployees = Array.isArray(employeesPayload)
    ? employeesPayload.map((item) => normaliseRunEmployee(pick(asRecord(item), "run_employee")))
    : [];

  const inputs = await loadRunCalculationInputs(supabase, companyId, run, runEmployees);
  const result = computeRunCalculation({
    periodStart: run.period_start,
    periodEnd: run.period_end,
    currencyCode: inputs.currencyCode,
    roundingMode: inputs.roundingMode,
    workingDaysPerWeek: inputs.workingDaysPerWeek,
    workingHoursPerDay: inputs.workingHoursPerDay,
    employees: inputs.employees,
    allSalaryLines: inputs.allSalaryLines,
    components: inputs.components,
  });

  const payload = serialiseRunCalculationForRpc(result, inputs.components, inputs.employees);
  const saved = await callRpc<unknown>(
    supabase,
    rpcName,
    { _company_id: companyId, _run_id: runId, _calculation: payload },
    PAYROLL_RUNS_MIGRATION,
  );
  return normaliseRun(saved);
}

export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; status?: string | null }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeRunsTable(context.supabase, data.companyId);
    if (missing) return missing;

    const raw = await callRpc<unknown>(
      context.supabase,
      "list_payroll_runs",
      { _company_id: data.companyId, _status: data.status },
      PAYROLL_RUNS_MIGRATION,
    );
    const payload = asRecord(raw);
    const runs = pick(payload, "runs");
    return {
      available: true as const,
      runs: Array.isArray(runs) ? runs.map(normaliseRun) : [],
      migrationMessage: null as string | null,
    } satisfies PayrollRunsListPage;
  });

export const getPayrollRunPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeRunsTable(context.supabase, data.companyId);
    if (missing) throw new Error(PAYROLL_RUNS_MIGRATION);

    const raw = await callRpc<unknown>(
      context.supabase,
      "get_payroll_run_page",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_RUNS_MIGRATION,
    );
    const page = asRecord(raw);
    const employeesRaw = pick(page, "employees");
    const paymentsRaw = pick(page, "payments");
    return {
      available: true as const,
      run: normaliseRun(pick(page, "run")),
      schedule: normaliseSchedule(pick(page, "schedule")),
      employees: Array.isArray(employeesRaw)
        ? employeesRaw.map((item) => {
            const row = asRecord(item);
            const payslipRaw = pick(row, "payslip");
            return {
              run_employee: normaliseRunEmployee(pick(row, "run_employee")),
              employee: normaliseEmployee(pick(row, "employee")),
              payslip:
                payslipRaw && typeof payslipRaw === "object"
                  ? normalisePayslip(payslipRaw)
                  : null,
            };
          })
        : [],
      lines: Array.isArray(pick(page, "lines"))
        ? (pick(page, "lines") as unknown[]).map(normaliseRunLine)
        : [],
      payments: Array.isArray(paymentsRaw)
        ? paymentsRaw.map((item) => {
            const row = asRecord(item);
            return {
              id: str(pick(row, "id")),
              payment_date: str(pick(row, "payment_date")),
              amount_minor: num(pick(row, "amount_minor")),
              status: str(pick(row, "status")),
              reference: strOrNull(pick(row, "reference")),
            } satisfies PayrollPaymentSummaryRow;
          })
        : [],
      net_outstanding_minor: num(pick(page, "net_outstanding_minor")),
    } satisfies PayrollRunPage;
  });

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      payScheduleId: string;
      periodStart: string;
      periodEnd: string;
      paymentDate: string;
    }) => ({
      companyId: companyIdOf(input),
      payScheduleId: input.payScheduleId,
      periodStart: input.periodStart.trim(),
      periodEnd: input.periodEnd.trim(),
      paymentDate: input.paymentDate.trim(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.prepare");
    const saved = await callRpc<unknown>(
      context.supabase,
      "create_payroll_run",
      {
        _company_id: data.companyId,
        _payload: {
          pay_schedule_id: data.payScheduleId,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          payment_date: data.paymentDate,
        },
      },
      PAYROLL_RUNS_MIGRATION,
    );
    return normaliseRun(saved);
  });

export const calculatePayrollRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.prepare");
    return computeAndPersistRun(
      context.supabase,
      data.companyId,
      data.runId,
      "calculate_payroll_run",
    );
  });

export const recalculatePayrollRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.prepare");
    return computeAndPersistRun(
      context.supabase,
      data.companyId,
      data.runId,
      "recalculate_payroll_run",
    );
  });

export const markPayrollRunReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.prepare");
    const saved = await callRpc<unknown>(
      context.supabase,
      "mark_payroll_run_reviewed",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_RUNS_MIGRATION,
    );
    return normaliseRun(saved);
  });

export const approvePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.approve");
    const saved = await callRpc<unknown>(
      context.supabase,
      "approve_payroll_run",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_RUNS_MIGRATION,
    );
    return normaliseRun(saved);
  });

export const voidPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.prepare");
    const saved = await callRpc<unknown>(
      context.supabase,
      "void_payroll_run",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_RUNS_MIGRATION,
    );
    return normaliseRun(saved);
  });

export const listPayrollPayslips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId?: string | null }) => ({
    companyId: companyIdOf(input),
    runId: input.runId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeRunsTable(context.supabase, data.companyId);
    if (missing) {
      return {
        available: false,
        payslips: [],
        migrationMessage: missing.migrationMessage,
      } satisfies PayrollPayslipsListPage;
    }

    const raw = await callRpc<unknown>(
      context.supabase,
      "list_payroll_payslips",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_RUNS_MIGRATION,
    );
    const payload = asRecord(raw);
    const items = pick(payload, "payslips");
    return {
      available: true as const,
      payslips: Array.isArray(items)
        ? items.map((item) => {
            const row = asRecord(item);
            return {
              payslip: normalisePayslip(pick(row, "payslip")),
              employee: normaliseEmployee(pick(row, "employee")),
              run: normaliseRun(pick(row, "run")),
            };
          })
        : [],
      migrationMessage: null as string | null,
    } satisfies PayrollPayslipsListPage;
  });

export const getPayrollPayslipPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; payslipId: string }) => ({
    companyId: companyIdOf(input),
    payslipId: input.payslipId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeRunsTable(context.supabase, data.companyId);
    if (missing) throw new Error(PAYROLL_RUNS_MIGRATION);

    const raw = await callRpc<unknown>(
      context.supabase,
      "get_payroll_payslip",
      { _company_id: data.companyId, _payslip_id: data.payslipId },
      PAYROLL_RUNS_MIGRATION,
    );
    const page = asRecord(raw);
    return {
      available: true as const,
      payslip: normalisePayslip(pick(page, "payslip")),
      employee: normaliseEmployee(pick(page, "employee")),
      run: normaliseRun(pick(page, "run")),
    } satisfies PayrollPayslipPage;
  });
