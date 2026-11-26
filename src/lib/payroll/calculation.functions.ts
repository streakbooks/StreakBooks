import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { toSafeMinorNumber } from "@/lib/accounting/money";
import { companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import {
  calculatePayrollRun,
  type CalculationResult,
  type EmployeeCalcInput,
  type EmployeePeriodAdjustments,
  type LineInput,
} from "@/lib/payroll/calculation-engine";
import { PAYROLL_MIGRATION } from "@/lib/payroll/payroll.functions";
import { assertRoundingMode } from "@/lib/payroll/settings-draft";
import type {
  PayrollComponentTypeRow,
  PayrollEmployeeRow,
  PayrollEmployeeSalaryLineRow,
  PayrollRoundingMode,
} from "@/lib/payroll/types";

export type SerializableLineResult = {
  lineId: string | null;
  componentTypeId: string;
  componentCode: string;
  kind: LineInput["kind"];
  calculationMethod: LineInput["calculationMethod"];
  amountMinor: number;
  notes: string | null;
};

export type SerializableEmployeeResult = {
  employeeId: string;
  grossEarningsMinor: number;
  employeeDeductionsMinor: number;
  netPayMinor: number;
  employerContributionsMinor: number;
  totalEmployerCostMinor: number;
  basicEarningsMinor: number;
  taxableEarningsMinor: number;
  lines: SerializableLineResult[];
  proration: {
    periodWorkingDays: number;
    eligibleWorkingDays: number;
    unpaidLeaveDays: number;
  };
};

export type PreviewCalculatePayrollResult = {
  currencyCode: string;
  roundingMode: PayrollRoundingMode;
  employees: SerializableEmployeeResult[];
  totals: {
    grossEarningsMinor: number;
    employeeDeductionsMinor: number;
    netPayMinor: number;
    employerContributionsMinor: number;
    totalEmployerCostMinor: number;
  };
  permissionUsed: "payroll.run.prepare" | "payroll.view";
};

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
    is_taxable: Boolean(pick(row, "is_taxable")),
    is_recurring_default: Boolean(pick(row, "is_recurring_default")),
    is_system: Boolean(pick(row, "is_system")),
    is_active: Boolean(pick(row, "is_active")),
    sort_order: num(pick(row, "sort_order") || 100),
    expense_account_id: strOrNull(pick(row, "expense_account_id")),
    liability_account_id: strOrNull(pick(row, "liability_account_id")),
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
    is_recurring: Boolean(pick(row, "is_recurring")),
    effective_from: str(pick(row, "effective_from")),
    effective_to: strOrNull(pick(row, "effective_to")),
    notes: strOrNull(pick(row, "notes")),
  };
}

function lineOverlapsPeriod(
  line: PayrollEmployeeSalaryLineRow,
  periodStart: string,
  periodEnd: string,
): boolean {
  if (line.effective_from > periodEnd) return false;
  if (line.effective_to && line.effective_to < periodStart) return false;
  return true;
}

function pickEffectiveLines(
  lines: PayrollEmployeeSalaryLineRow[],
  periodStart: string,
  periodEnd: string,
): PayrollEmployeeSalaryLineRow[] {
  const overlapping = lines.filter((line) => lineOverlapsPeriod(line, periodStart, periodEnd));
  const byComponent = new Map<string, PayrollEmployeeSalaryLineRow>();
  for (const line of overlapping) {
    const existing = byComponent.get(line.component_type_id);
    if (!existing || line.effective_from > existing.effective_from) {
      byComponent.set(line.component_type_id, line);
    }
  }
  return [...byComponent.values()];
}

function toLineInput(
  salaryLine: PayrollEmployeeSalaryLineRow,
  component: PayrollComponentTypeRow,
): LineInput {
  return {
    lineId: salaryLine.id,
    componentTypeId: component.id,
    componentCode: component.code,
    kind: component.kind,
    calculationMethod: component.calculation_method,
    percentageBase: component.percentage_base,
    isTaxable: component.is_taxable,
    sortOrder: component.sort_order,
    amountMinor: BigInt(salaryLine.amount_minor),
    rateMinor: BigInt(salaryLine.rate_minor),
    percentageBps: salaryLine.percentage_bps,
    isRecurring: salaryLine.is_recurring,
  };
}

function serializeResult(result: CalculationResult): PreviewCalculatePayrollResult["employees"] {
  return result.employees.map((emp) => ({
    employeeId: emp.employeeId,
    grossEarningsMinor: toSafeMinorNumber(emp.grossEarningsMinor, "Gross earnings"),
    employeeDeductionsMinor: toSafeMinorNumber(emp.employeeDeductionsMinor, "Deductions"),
    netPayMinor: toSafeMinorNumber(emp.netPayMinor, "Net pay"),
    employerContributionsMinor: toSafeMinorNumber(
      emp.employerContributionsMinor,
      "Employer contributions",
    ),
    totalEmployerCostMinor: toSafeMinorNumber(emp.totalEmployerCostMinor, "Employer cost"),
    basicEarningsMinor: toSafeMinorNumber(emp.basicEarningsMinor, "Basic earnings"),
    taxableEarningsMinor: toSafeMinorNumber(emp.taxableEarningsMinor, "Taxable earnings"),
    lines: emp.lines.map((line) => ({
      lineId: line.lineId,
      componentTypeId: line.componentTypeId,
      componentCode: line.componentCode,
      kind: line.kind,
      calculationMethod: line.calculationMethod,
      amountMinor: toSafeMinorNumber(line.amountMinor, "Line amount"),
      notes: line.notes,
    })),
    proration: emp.proration,
  }));
}

async function assertPreviewPermission(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  companyId: string,
): Promise<PreviewCalculatePayrollResult["permissionUsed"]> {
  const { data: canPrepare, error: prepareError } = await supabase.rpc("has_company_permission", {
    _company_id: companyId,
    _permission: "payroll.run.prepare",
  });
  if (prepareError) throw new Error(prepareError.message);
  if (canPrepare) return "payroll.run.prepare";

  const { data: canView, error: viewError } = await supabase.rpc("has_company_permission", {
    _company_id: companyId,
    _permission: "payroll.view",
  });
  if (viewError) throw new Error(viewError.message);
  if (!canView) {
    throw new Error("You do not have permission to preview payroll for this organisation.");
  }
  return "payroll.view";
}

export const previewCalculatePayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      periodStart: string;
      periodEnd: string;
      employeeIds?: string[] | null;
      adjustmentsByEmployee?: Record<string, EmployeePeriodAdjustments> | null;
    }) => ({
      companyId: companyIdOf(input),
      periodStart: input.periodStart.trim(),
      periodEnd: input.periodEnd.trim(),
      employeeIds: input.employeeIds?.filter(Boolean) ?? null,
      adjustmentsByEmployee: input.adjustmentsByEmployee ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const permissionUsed = await assertPreviewPermission(context.supabase, data.companyId);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.periodStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.periodEnd)
    ) {
      throw new Error("Pay period start and end must be YYYY-MM-DD.");
    }
    if (data.periodStart > data.periodEnd) {
      throw new Error("Pay period end must be on or after the start date.");
    }

    const settingsProbe = await context.supabase
      .from("payroll_settings" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (settingsProbe.error) {
      if (isMissingRelation(settingsProbe.error)) throw new Error(PAYROLL_MIGRATION);
      throw new Error(settingsProbe.error.message);
    }
    const settingsRow = settingsProbe.data as Record<string, unknown> | null;
    if (!settingsRow) {
      throw new Error("Configure payroll settings before running a calculation preview.");
    }

    const roundingMode = assertRoundingMode(str(settingsRow["rounding_mode"] || "half_up"));
    const workingDaysPerWeek = num(settingsRow["default_working_days_per_week"] || 5);
    const workingHoursPerDay = num(settingsRow["default_working_hours_per_day"] || 8);
    const payrollCurrency = str(settingsRow["payroll_currency"] || "USD");

    const componentsRes = await context.supabase
      .from("payroll_component_types" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never);
    if (componentsRes.error) throw new Error(componentsRes.error.message);
    const components = (componentsRes.data ?? []).map(normaliseComponent);
    const componentById = new Map(components.map((c) => [c.id, c]));

    let employeesQuery = context.supabase
      .from("payroll_employees" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("status" as never, "active" as never);
    if (data.employeeIds?.length) {
      employeesQuery = employeesQuery.in("id" as never, data.employeeIds as never);
    }
    const employeesRes = await employeesQuery;
    if (employeesRes.error) {
      if (isMissingRelation(employeesRes.error)) throw new Error(PAYROLL_MIGRATION);
      throw new Error(employeesRes.error.message);
    }
    const employees = (employeesRes.data ?? []).map(normaliseEmployee);
    if (employees.length === 0) {
      throw new Error("No active employees matched this preview.");
    }

    const employeeIds = employees.map((e) => e.id);
    const linesRes = await context.supabase
      .from("payroll_employee_salary_lines" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("employee_id" as never, employeeIds as never);
    if (linesRes.error) throw new Error(linesRes.error.message);
    const allLines = (linesRes.data ?? []).map(normaliseSalaryLine);

    const calcEmployees: EmployeeCalcInput[] = employees.map((emp) => {
      const empLines = allLines.filter((l) => l.employee_id === emp.id);
      const effective = pickEffectiveLines(empLines, data.periodStart, data.periodEnd);
      const lineInputs: LineInput[] = [];
      for (const salaryLine of effective) {
        const component = componentById.get(salaryLine.component_type_id);
        if (!component) continue;
        lineInputs.push(toLineInput(salaryLine, component));
      }
      const calc: EmployeeCalcInput = {
        employeeId: emp.id,
        employmentType: emp.employment_type,
        hireDate: emp.hire_date,
        terminationDate: emp.termination_date,
        lines: lineInputs,
      };
      const adjustments = data.adjustmentsByEmployee?.[emp.id];
      if (adjustments) calc.adjustments = adjustments;
      return calc;
    });

    const result = calculatePayrollRun({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      currencyCode: payrollCurrency,
      roundingMode,
      workingDaysPerWeek,
      workingHoursPerDay,
      employees: calcEmployees,
    });

    const serializedEmployees = serializeResult(result);
    return {
      currencyCode: result.currencyCode,
      roundingMode: result.roundingMode,
      employees: serializedEmployees,
      totals: {
        grossEarningsMinor: toSafeMinorNumber(result.totals.grossEarningsMinor, "Total gross"),
        employeeDeductionsMinor: toSafeMinorNumber(
          result.totals.employeeDeductionsMinor,
          "Total deductions",
        ),
        netPayMinor: toSafeMinorNumber(result.totals.netPayMinor, "Total net"),
        employerContributionsMinor: toSafeMinorNumber(
          result.totals.employerContributionsMinor,
          "Total employer contributions",
        ),
        totalEmployerCostMinor: toSafeMinorNumber(
          result.totals.totalEmployerCostMinor,
          "Total employer cost",
        ),
      },
      permissionUsed,
    } satisfies PreviewCalculatePayrollResult;
  });
