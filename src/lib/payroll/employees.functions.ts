import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import {
  parsePaymentDetailsDraft,
  parsePayrollEmployeeDraft,
  parseSalaryAssignDraft,
  parseSalaryStructureDraft,
  type PaymentDetailsDraft,
  type PayrollEmployeeDraft,
  type SalaryAssignDraft,
  type SalaryStructureDraft,
} from "@/lib/payroll/employee-draft";
import { assertPaymentMethod } from "@/lib/payroll/settings-draft";
import {
  type PayrollComponentTypeRow,
  type PayrollEmployeePage,
  type PayrollEmployeePaymentMasked,
  type PayrollEmployeeRow,
  type PayrollEmployeeSalaryLineRow,
  type PayrollEmployeeSalaryVersionRow,
  type PayrollEmployeesListPage,
  type PayrollPayScheduleRow,
  type PayrollSalaryStructureLineRow,
  type PayrollSalaryStructureRow,
  type PayrollSalaryStructuresPage,
} from "@/lib/payroll/types";

export const PAYROLL_MIGRATION =
  "Basic Global Payroll employees are not available yet: the database update 20261105160709 has not been applied.";

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
    payment_method: assertPaymentMethod(str(pick(row, "payment_method") || "bank_transfer")),
    notes: strOrNull(pick(row, "notes")),
    archived_at: strOrNull(pick(row, "archived_at")),
    created_at: str(pick(row, "created_at")),
    updated_at: str(pick(row, "updated_at")),
  };
}

function normalisePayment(raw: unknown): PayrollEmployeePaymentMasked | null {
  if (!raw || typeof raw !== "object") return null;
  const row = asRecord(raw);
  return {
    account_name: strOrNull(pick(row, "account_name")),
    bank_name: strOrNull(pick(row, "bank_name")),
    account_number_masked: strOrNull(pick(row, "account_number_masked")),
    sort_code_masked: strOrNull(pick(row, "sort_code_masked")),
    iban_masked: strOrNull(pick(row, "iban_masked")),
    bic: strOrNull(pick(row, "bic")),
    has_account_number: bool(pick(row, "has_account_number")),
    has_sort_code: bool(pick(row, "has_sort_code")),
    has_iban: bool(pick(row, "has_iban")),
  };
}

function normaliseStructure(raw: unknown): PayrollSalaryStructureRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    name: str(pick(row, "name")),
    description: strOrNull(pick(row, "description")),
    is_active: bool(pick(row, "is_active"), true),
    created_at: str(pick(row, "created_at")),
    updated_at: str(pick(row, "updated_at")),
  };
}

function normaliseStructureLine(raw: unknown): PayrollSalaryStructureLineRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    structure_id: str(pick(row, "structure_id")),
    component_type_id: str(pick(row, "component_type_id")),
    amount_minor: num(pick(row, "amount_minor")),
    rate_minor: num(pick(row, "rate_minor")),
    percentage_bps: num(pick(row, "percentage_bps")),
    is_recurring: bool(pick(row, "is_recurring"), true),
    sort_order: num(pick(row, "sort_order") || 100),
  };
}

function normaliseSalaryVersion(raw: unknown): PayrollEmployeeSalaryVersionRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    employee_id: str(pick(row, "employee_id")),
    structure_id: strOrNull(pick(row, "structure_id")),
    effective_from: str(pick(row, "effective_from")),
    effective_to: strOrNull(pick(row, "effective_to")),
    change_reason: strOrNull(pick(row, "change_reason")),
    created_at: str(pick(row, "created_at")),
  };
}

function normaliseSalaryLine(raw: unknown): PayrollEmployeeSalaryLineRow {
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

function normaliseComponent(raw: unknown): PayrollComponentTypeRow {
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
    percentage_base:
      (strOrNull(pick(row, "percentage_base")) as PayrollComponentTypeRow["percentage_base"]) ??
      null,
    is_taxable: bool(pick(row, "is_taxable"), true),
    is_recurring_default: bool(pick(row, "is_recurring_default"), true),
    is_system: bool(pick(row, "is_system")),
    is_active: bool(pick(row, "is_active"), true),
    sort_order: num(pick(row, "sort_order") || 100),
    expense_account_id: strOrNull(pick(row, "expense_account_id")),
    liability_account_id: strOrNull(pick(row, "liability_account_id")),
  };
}

async function probeEmployeesTable(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
): Promise<PayrollEmployeesListPage | null> {
  const probe = await supabase
    .from("payroll_employees" as never)
    .select("id" as never)
    .eq("company_id" as never, companyId as never)
    .limit(1);
  if (probe.error && isMissingRelation(probe.error)) {
    return { available: false, employees: [], migrationMessage: PAYROLL_MIGRATION };
  }
  if (probe.error) throw new Error(probe.error.message);
  return null;
}

export const listPayrollEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; status?: string | null; q?: string | null }) => ({
    companyId: companyIdOf(input),
    status: input.status?.trim() || null,
    q: input.q?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeEmployeesTable(context.supabase, data.companyId);
    if (missing) return missing;

    const raw = await callRpc<unknown>(
      context.supabase,
      "list_payroll_employees",
      {
        _company_id: data.companyId,
        _status: data.status,
        _q: data.q,
      },
      PAYROLL_MIGRATION,
    );
    const payload = asRecord(raw);
    const employees = pick(payload, "employees");
    return {
      available: true as const,
      employees: Array.isArray(employees) ? employees.map(normaliseEmployee) : [],
      migrationMessage: null as string | null,
    };
  });

export const getPayrollEmployeePage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; employeeId: string }) => ({
    companyId: companyIdOf(input),
    employeeId: input.employeeId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeEmployeesTable(context.supabase, data.companyId);
    if (missing) throw new Error(PAYROLL_MIGRATION);

    const raw = await callRpc<unknown>(
      context.supabase,
      "get_payroll_employee_page",
      { _company_id: data.companyId, _employee_id: data.employeeId },
      PAYROLL_MIGRATION,
    );
    const page = asRecord(raw);
    const paymentRaw = pick(page, "payment");
    return {
      available: true as const,
      employee: normaliseEmployee(pick(page, "employee")),
      payment: paymentRaw ? normalisePayment(paymentRaw) : null,
      salary_versions: Array.isArray(pick(page, "salary_versions"))
        ? (pick(page, "salary_versions") as unknown[]).map(normaliseSalaryVersion)
        : [],
      salary_lines: Array.isArray(pick(page, "salary_lines"))
        ? (pick(page, "salary_lines") as unknown[]).map(normaliseSalaryLine)
        : [],
      structures: Array.isArray(pick(page, "structures"))
        ? (pick(page, "structures") as unknown[]).map(normaliseStructure)
        : [],
      schedules: Array.isArray(pick(page, "schedules"))
        ? (pick(page, "schedules") as unknown[]).map(normaliseSchedule)
        : [],
      components: Array.isArray(pick(page, "components"))
        ? (pick(page, "components") as unknown[]).map(normaliseComponent)
        : [],
    } satisfies PayrollEmployeePage;
  });

export const savePayrollEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: PayrollEmployeeDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const parsed = parsePayrollEmployeeDraft(data.draft);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "save_payroll_employee",
      { _company_id: data.companyId, _payload: parsed.value },
      PAYROLL_MIGRATION,
    );
    return normaliseEmployee(saved);
  });

export const savePayrollEmployeePaymentDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; employeeId: string; draft: PaymentDetailsDraft }) => ({
    companyId: companyIdOf(input),
    employeeId: input.employeeId,
    draft: input.draft,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const parsed = parsePaymentDetailsDraft(data.draft);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "save_payroll_employee_payment_details",
      {
        _company_id: data.companyId,
        _employee_id: data.employeeId,
        _payload: parsed.value,
      },
      PAYROLL_MIGRATION,
    );
    return normalisePayment(saved);
  });

export const listPayrollSalaryStructures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const missing = await probeEmployeesTable(context.supabase, data.companyId);
    if (missing) {
      return {
        available: false,
        structures: [],
        lines: [],
        migrationMessage: missing.migrationMessage,
      } satisfies PayrollSalaryStructuresPage;
    }

    const raw = await callRpc<unknown>(
      context.supabase,
      "list_payroll_salary_structures",
      { _company_id: data.companyId },
      PAYROLL_MIGRATION,
    );
    const payload = asRecord(raw);
    return {
      available: true as const,
      structures: Array.isArray(pick(payload, "structures"))
        ? (pick(payload, "structures") as unknown[]).map(normaliseStructure)
        : [],
      lines: Array.isArray(pick(payload, "lines"))
        ? (pick(payload, "lines") as unknown[]).map(normaliseStructureLine)
        : [],
      migrationMessage: null as string | null,
    };
  });

export const savePayrollSalaryStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; draft: SalaryStructureDraft; currencyCode: string }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
    currencyCode: input.currencyCode.trim().toUpperCase(),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const parsed = parseSalaryStructureDraft(data.draft, data.currencyCode);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "save_payroll_salary_structure",
      { _company_id: data.companyId, _payload: parsed.value },
      PAYROLL_MIGRATION,
    );
    return normaliseStructure(saved);
  });

export const assignPayrollEmployeeSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      employeeId: string;
      draft: SalaryAssignDraft;
      currencyCode: string;
    }) => ({
      companyId: companyIdOf(input),
      employeeId: input.employeeId,
      draft: input.draft,
      currencyCode: input.currencyCode.trim().toUpperCase(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.employees.manage");
    const parsed = parseSalaryAssignDraft(data.draft, data.currencyCode);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "assign_payroll_employee_salary",
      {
        _company_id: data.companyId,
        _employee_id: data.employeeId,
        _payload: parsed.value,
      },
      PAYROLL_MIGRATION,
    );
    return normaliseSalaryVersion(saved);
  });
