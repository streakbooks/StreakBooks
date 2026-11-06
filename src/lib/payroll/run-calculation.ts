/**
 * Shared helpers to run calculation-engine for a payroll run and serialise for RPC persistence.
 */

import { toSafeMinorNumber } from "@/lib/accounting/money";
import {
  calculatePayrollRun,
  HOURS_MICRO_SCALE,
  type CalculationResult,
  type EmployeeCalcInput,
  type EmployeePeriodAdjustments,
  type LineInput,
} from "@/lib/payroll/calculation-engine";
import type {
  PayrollComponentTypeRow,
  PayrollEmployeeRow,
  PayrollEmployeeSalaryLineRow,
  PayrollRoundingMode,
  PayrollRunLineRow,
} from "@/lib/payroll/types";

export type VariableLineValues = {
  amountMinor: number;
  quantityMicro: number | null;
  rateMinor: number | null;
  percentageBps: number | null;
};

const QUANTITY_MICRO_SCALE_NUMBER = Number(HOURS_MICRO_SCALE);

/** Human-readable hours/units → micro-units (same scale as calculation-engine). */
export function parseQuantityMicroOrThrow(raw: string, fieldLabel: string): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${fieldLabel} is required.`);
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${fieldLabel} must be a non-negative number.`);
  }
  const micro = Math.round(n * QUANTITY_MICRO_SCALE_NUMBER);
  if (!Number.isSafeInteger(micro)) {
    throw new Error(`${fieldLabel} is too large.`);
  }
  return micro;
}

export function formatQuantityFromMicro(micro: number | null | undefined): string {
  if (micro == null) return "";
  const value = micro / QUANTITY_MICRO_SCALE_NUMBER;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/\.?0+$/, "");
}

export type RunCalculationPersistEmployee = {
  employeeId: string;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  employerMinor: number;
  employerCostMinor: number;
  hoursLeaveSnapshot: Record<string, unknown> | null;
  lines: {
    componentTypeId: string;
    kind: string;
    code: string;
    name: string;
    amountMinor: number;
    quantityMicro: number | null;
    rateMinor: number | null;
    percentageBps: number | null;
    isEmployer: boolean;
    sortOrder: number;
    isVariable: boolean;
  }[];
};

export type RunCalculationPersistPayload = {
  currency: string;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  employerMinor: number;
  employerCostMinor: number;
  employees: RunCalculationPersistEmployee[];
};

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

export function buildCalculationAdjustmentsFromRunLines(
  runLines: PayrollRunLineRow[],
  runEmployeeIdToEmployeeId: Map<string, string>,
  componentById?: Map<string, PayrollComponentTypeRow>,
): {
  adjustmentsByEmployee: Record<string, EmployeePeriodAdjustments>;
  variableLinesByEmployee: Record<string, Record<string, VariableLineValues>>;
} {
  const variableLinesByEmployee: Record<string, Record<string, VariableLineValues>> = {};

  for (const line of runLines) {
    if (!line.is_variable || !line.component_type_id) continue;
    const employeeId = runEmployeeIdToEmployeeId.get(line.run_employee_id);
    if (!employeeId) continue;
    const byComponent =
      variableLinesByEmployee[employeeId] ?? (variableLinesByEmployee[employeeId] = {});
    byComponent[line.component_type_id] = {
      amountMinor: line.amount_minor,
      quantityMicro: line.quantity_micro,
      rateMinor: line.rate_minor,
      percentageBps: line.percentage_bps,
    };
  }

  const adjustmentsByEmployee: Record<string, EmployeePeriodAdjustments> = {};
  for (const [employeeId, byComponent] of Object.entries(variableLinesByEmployee)) {
    const manualAmountMinor: Record<string, bigint> = {};
    const quantityMicroByComponent: Record<string, bigint> = {};

    for (const [componentTypeId, values] of Object.entries(byComponent)) {
      const method = componentById?.get(componentTypeId)?.calculation_method;

      if (method === "hourly" || method === "unit") {
        if (values.quantityMicro != null) {
          quantityMicroByComponent[componentTypeId] = BigInt(values.quantityMicro);
        }
        continue;
      }

      manualAmountMinor[componentTypeId] = BigInt(values.amountMinor);
      if (values.quantityMicro != null) {
        quantityMicroByComponent[componentTypeId] = BigInt(values.quantityMicro);
      }
    }

    adjustmentsByEmployee[employeeId] = {
      ...(Object.keys(manualAmountMinor).length > 0 ? { manualAmountMinor } : {}),
      ...(Object.keys(quantityMicroByComponent).length > 0 ? { quantityMicroByComponent } : {}),
    };
  }

  return { adjustmentsByEmployee, variableLinesByEmployee };
}

function ensureLineInputsForVariableComponents(
  lineInputs: LineInput[],
  variableLines: Record<string, VariableLineValues>,
  componentById: Map<string, PayrollComponentTypeRow>,
): LineInput[] {
  const existing = new Set(lineInputs.map((l) => l.componentTypeId));
  const out = [...lineInputs];
  for (const [componentTypeId, values] of Object.entries(variableLines)) {
    if (existing.has(componentTypeId)) continue;
    const component = componentById.get(componentTypeId);
    if (!component || component.calculation_method !== "manual") continue;
    out.push({
      lineId: null,
      componentTypeId,
      componentCode: component.code,
      kind: component.kind,
      calculationMethod: component.calculation_method,
      percentageBase: component.percentage_base,
      isTaxable: component.is_taxable,
      sortOrder: component.sort_order,
      amountMinor: BigInt(values.amountMinor),
      rateMinor: values.rateMinor != null ? BigInt(values.rateMinor) : 0n,
      percentageBps: values.percentageBps ?? 0,
      isRecurring: false,
      ...(values.quantityMicro != null ? { quantityMicro: BigInt(values.quantityMicro) } : {}),
    });
    existing.add(componentTypeId);
  }
  return out;
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

export function computeRunCalculation(input: {
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  roundingMode: PayrollRoundingMode;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  employees: PayrollEmployeeRow[];
  allSalaryLines: PayrollEmployeeSalaryLineRow[];
  components: PayrollComponentTypeRow[];
  adjustmentsByEmployee?: Record<string, EmployeePeriodAdjustments> | null;
  /** Existing variable lines keyed by employeeId → componentTypeId */
  variableLinesByEmployee?: Record<
    string,
    Record<
      string,
      {
        amountMinor: number;
        quantityMicro: number | null;
        rateMinor: number | null;
        percentageBps: number | null;
      }
    >
  >;
}): CalculationResult {
  const componentById = new Map(input.components.map((c) => [c.id, c]));
  const calcEmployees: EmployeeCalcInput[] = input.employees.map((emp) => {
    const empLines = input.allSalaryLines.filter((l) => l.employee_id === emp.id);
    const effective = pickEffectiveLines(empLines, input.periodStart, input.periodEnd);
    let lineInputs: LineInput[] = [];
    for (const salaryLine of effective) {
      const component = componentById.get(salaryLine.component_type_id);
      if (!component) continue;
      lineInputs.push(toLineInput(salaryLine, component));
    }
    const variableForEmp = input.variableLinesByEmployee?.[emp.id];
    if (variableForEmp) {
      lineInputs = ensureLineInputsForVariableComponents(lineInputs, variableForEmp, componentById);
    }
    const calc: EmployeeCalcInput = {
      employeeId: emp.id,
      employmentType: emp.employment_type,
      hireDate: emp.hire_date,
      terminationDate: emp.termination_date,
      lines: lineInputs,
    };
    const adjustments = input.adjustmentsByEmployee?.[emp.id];
    if (adjustments) calc.adjustments = adjustments;
    return calc;
  });

  return calculatePayrollRun({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currencyCode: input.currencyCode,
    roundingMode: input.roundingMode,
    workingDaysPerWeek: input.workingDaysPerWeek,
    workingHoursPerDay: input.workingHoursPerDay,
    employees: calcEmployees,
  });
}

export function serialiseRunCalculationForRpc(
  result: CalculationResult,
  components: PayrollComponentTypeRow[],
  employees: PayrollEmployeeRow[],
): RunCalculationPersistPayload {
  const componentById = new Map(components.map((c) => [c.id, c]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const persistEmployees: RunCalculationPersistEmployee[] = result.employees.map((emp) => {
    const empRow = employeeById.get(emp.employeeId);
    const lines = emp.lines.map((line) => {
      const component = componentById.get(line.componentTypeId);
      const isManual = component?.calculation_method === "manual";
      return {
        componentTypeId: line.componentTypeId,
        kind: line.kind,
        code: line.componentCode,
        name: component?.name ?? line.componentCode,
        amountMinor: toSafeMinorNumber(line.amountMinor, "Line amount"),
        quantityMicro: null,
        rateMinor: null,
        percentageBps: null,
        isEmployer: line.kind === "employer_contribution",
        sortOrder: component?.sort_order ?? 100,
        isVariable: isManual,
      };
    });

    return {
      employeeId: emp.employeeId,
      grossMinor: toSafeMinorNumber(emp.grossEarningsMinor, "Gross"),
      deductionsMinor: toSafeMinorNumber(emp.employeeDeductionsMinor, "Deductions"),
      netMinor: toSafeMinorNumber(emp.netPayMinor, "Net"),
      employerMinor: toSafeMinorNumber(emp.employerContributionsMinor, "Employer"),
      employerCostMinor: toSafeMinorNumber(emp.totalEmployerCostMinor, "Employer cost"),
      hoursLeaveSnapshot: empRow
        ? {
            proration: emp.proration,
          }
        : null,
      lines,
    };
  });

  return {
    currency: result.currencyCode,
    grossMinor: toSafeMinorNumber(result.totals.grossEarningsMinor, "Total gross"),
    deductionsMinor: toSafeMinorNumber(result.totals.employeeDeductionsMinor, "Total deductions"),
    netMinor: toSafeMinorNumber(result.totals.netPayMinor, "Total net"),
    employerMinor: toSafeMinorNumber(
      result.totals.employerContributionsMinor,
      "Total employer contributions",
    ),
    employerCostMinor: toSafeMinorNumber(
      result.totals.totalEmployerCostMinor,
      "Total employer cost",
    ),
    employees: persistEmployees,
  };
}
