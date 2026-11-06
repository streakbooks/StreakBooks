import { describe, expect, it } from "vitest";
import { toMinorUnits } from "@/lib/accounting/money";
import {
  buildCalculationAdjustmentsFromRunLines,
  computeRunCalculation,
  formatQuantityFromMicro,
  parseQuantityMicroOrThrow,
} from "@/lib/payroll/run-calculation";
import type {
  PayrollComponentTypeRow,
  PayrollEmployeeRow,
  PayrollEmployeeSalaryLineRow,
  PayrollRunLineRow,
} from "@/lib/payroll/types";

const USD = "USD";

function component(
  over: Partial<PayrollComponentTypeRow> & Pick<PayrollComponentTypeRow, "id" | "code">,
): PayrollComponentTypeRow {
  return {
    company_id: "co-1",
    name: over.code,
    kind: "earning",
    calculation_method: "fixed",
    percentage_base: null,
    is_taxable: true,
    is_recurring_default: true,
    is_system: false,
    is_active: true,
    sort_order: 100,
    expense_account_id: null,
    liability_account_id: null,
    ...over,
  };
}

function employeeRow(
  id: string,
  employmentType: PayrollEmployeeRow["employment_type"] = "salaried",
): PayrollEmployeeRow {
  return {
    id,
    company_id: "co-1",
    contact_id: "c-1",
    employee_number: "E1",
    first_name: "A",
    last_name: "B",
    email: null,
    status: "active",
    hire_date: "2020-01-01",
    termination_date: null,
    department: null,
    designation: null,
    employment_type: employmentType,
    work_location: null,
    payroll_country_code: "US",
    payroll_currency: USD,
    pay_schedule_id: null,
    salary_structure_id: null,
    payment_method: "bank_transfer",
    notes: null,
    archived_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

function salaryLine(
  employeeId: string,
  componentTypeId: string,
  amountMinor: number,
): PayrollEmployeeSalaryLineRow {
  return {
    id: `sl-${componentTypeId}`,
    company_id: "co-1",
    employee_id: employeeId,
    version_id: "v1",
    component_type_id: componentTypeId,
    amount_minor: amountMinor,
    rate_minor: 0,
    percentage_bps: 0,
    is_recurring: true,
    effective_from: "2020-01-01",
    effective_to: null,
    notes: null,
  };
}

describe("quantity micro helpers", () => {
  it("round-trips hours through micro-units", () => {
    expect(parseQuantityMicroOrThrow("40.5", "Hours")).toBe(40_500_000);
    expect(formatQuantityFromMicro(40_500_000)).toBe("40.5");
  });
});

describe("buildCalculationAdjustmentsFromRunLines", () => {
  it("maps variable run lines to manual amount overrides per employee", () => {
    const runLines: PayrollRunLineRow[] = [
      {
        id: "rl-1",
        company_id: "co-1",
        run_employee_id: "re-1",
        component_type_id: "bonus-manual",
        kind: "earning",
        code: "BONUS",
        name: "Bonus",
        amount_minor: 50_000,
        quantity_micro: null,
        rate_minor: null,
        percentage_bps: null,
        is_employer: false,
        is_variable: true,
        sort_order: 40,
      },
    ];
    const map = new Map([["re-1", "emp-1"]]);
    const { adjustmentsByEmployee, variableLinesByEmployee } =
      buildCalculationAdjustmentsFromRunLines(runLines, map);
    expect(adjustmentsByEmployee["emp-1"]?.manualAmountMinor?.["bonus-manual"]).toBe(50_000n);
    expect(variableLinesByEmployee["emp-1"]?.["bonus-manual"]?.amountMinor).toBe(50_000);
  });

  it("maps hourly variable lines to quantity overrides without manual amount", () => {
    const hourlyId = "c-hourly";
    const components = new Map([
      [
        hourlyId,
        component({ id: hourlyId, code: "HOURLY", calculation_method: "hourly", sort_order: 20 }),
      ],
    ]);
    const runLines: PayrollRunLineRow[] = [
      {
        id: "rl-h",
        company_id: "co-1",
        run_employee_id: "re-1",
        component_type_id: hourlyId,
        kind: "earning",
        code: "HOURLY",
        name: "Hourly",
        amount_minor: 0,
        quantity_micro: 35_000_000,
        rate_minor: null,
        percentage_bps: null,
        is_employer: false,
        is_variable: true,
        sort_order: 20,
      },
    ];
    const { adjustmentsByEmployee } = buildCalculationAdjustmentsFromRunLines(
      runLines,
      new Map([["re-1", "emp-1"]]),
      components,
    );
    expect(adjustmentsByEmployee["emp-1"]?.manualAmountMinor?.[hourlyId]).toBeUndefined();
    expect(adjustmentsByEmployee["emp-1"]?.quantityMicroByComponent?.[hourlyId]).toBe(35_000_000n);
  });
});

describe("computeRunCalculation with run adjustments", () => {
  const basicId = "c-basic";
  const bonusId = "c-bonus";
  const components = [
    component({ id: basicId, code: "BASIC", calculation_method: "fixed", sort_order: 10 }),
    component({
      id: bonusId,
      code: "BONUS",
      calculation_method: "manual",
      sort_order: 40,
      is_recurring_default: false,
    }),
  ];

  it("includes manual run adjustments in gross and net after recalculate-style input", () => {
    const empId = "emp-1";
    const basicAmount = Number(toMinorUnits("3000", USD));
    const bonusAmount = Number(toMinorUnits("750", USD));
    const runLines: PayrollRunLineRow[] = [
      {
        id: "rl-bonus",
        company_id: "co-1",
        run_employee_id: "re-1",
        component_type_id: bonusId,
        kind: "earning",
        code: "BONUS",
        name: "Bonus",
        amount_minor: bonusAmount,
        quantity_micro: null,
        rate_minor: null,
        percentage_bps: null,
        is_employer: false,
        is_variable: true,
        sort_order: 40,
      },
    ];
    const { adjustmentsByEmployee, variableLinesByEmployee } =
      buildCalculationAdjustmentsFromRunLines(runLines, new Map([["re-1", empId]]));

    const result = computeRunCalculation({
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currencyCode: USD,
      roundingMode: "half_up",
      workingDaysPerWeek: 5,
      workingHoursPerDay: 8,
      employees: [employeeRow(empId)],
      allSalaryLines: [salaryLine(empId, basicId, basicAmount)],
      components,
      adjustmentsByEmployee,
      variableLinesByEmployee,
    });

    const emp = result.employees.find((e) => e.employeeId === empId);
    expect(emp?.grossEarningsMinor).toBe(toMinorUnits("3750", USD));
    expect(emp?.netPayMinor).toBe(toMinorUnits("3750", USD));
    expect(result.totals.netPayMinor).toBe(toMinorUnits("3750", USD));
  });

  it("applies manual deduction adjustments to net pay", () => {
    const deductId = "c-ded-man";
    const deductComponents = [
      component({ id: basicId, code: "BASIC", calculation_method: "fixed", sort_order: 10 }),
      component({
        id: deductId,
        code: "OTHER_DED",
        kind: "deduction",
        calculation_method: "manual",
        sort_order: 150,
        is_recurring_default: false,
      }),
    ];
    const empId = "emp-2";
    const deductAmount = Number(toMinorUnits("200", USD));
    const runLines: PayrollRunLineRow[] = [
      {
        id: "rl-ded",
        company_id: "co-1",
        run_employee_id: "re-2",
        component_type_id: deductId,
        kind: "deduction",
        code: "OTHER_DED",
        name: "Other deduction",
        amount_minor: deductAmount,
        quantity_micro: null,
        rate_minor: null,
        percentage_bps: null,
        is_employer: false,
        is_variable: true,
        sort_order: 150,
      },
    ];
    const { adjustmentsByEmployee, variableLinesByEmployee } =
      buildCalculationAdjustmentsFromRunLines(runLines, new Map([["re-2", empId]]));

    const result = computeRunCalculation({
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currencyCode: USD,
      roundingMode: "half_up",
      workingDaysPerWeek: 5,
      workingHoursPerDay: 8,
      employees: [employeeRow(empId)],
      allSalaryLines: [salaryLine(empId, basicId, Number(toMinorUnits("3000", USD)))],
      components: deductComponents,
      adjustmentsByEmployee,
      variableLinesByEmployee,
    });

    const emp = result.employees.find((e) => e.employeeId === empId);
    expect(emp?.grossEarningsMinor).toBe(toMinorUnits("3000", USD));
    expect(emp?.employeeDeductionsMinor).toBe(toMinorUnits("200", USD));
    expect(emp?.netPayMinor).toBe(toMinorUnits("2800", USD));
  });

  it("recalculates hourly pay from saved period hours on variable run lines", () => {
    const hourlyId = "c-hourly";
    const otId = "c-ot";
    const hourlyComponents = [
      component({ id: hourlyId, code: "HOURLY", calculation_method: "hourly", sort_order: 20 }),
      component({
        id: otId,
        code: "OVERTIME",
        calculation_method: "hourly",
        sort_order: 30,
        is_recurring_default: false,
      }),
    ];
    const componentById = new Map(hourlyComponents.map((c) => [c.id, c]));
    const empId = "emp-hourly";
    const rateHourly = Number(toMinorUnits("25", USD));
    const rateOt = Number(toMinorUnits("37.50", USD));
    const runLines: PayrollRunLineRow[] = [
      {
        id: "rl-reg",
        company_id: "co-1",
        run_employee_id: "re-h",
        component_type_id: hourlyId,
        kind: "earning",
        code: "HOURLY",
        name: "Hourly",
        amount_minor: 0,
        quantity_micro: 40_000_000,
        rate_minor: null,
        percentage_bps: null,
        is_employer: false,
        is_variable: true,
        sort_order: 20,
      },
      {
        id: "rl-ot",
        company_id: "co-1",
        run_employee_id: "re-h",
        component_type_id: otId,
        kind: "earning",
        code: "OVERTIME",
        name: "Overtime",
        amount_minor: 0,
        quantity_micro: 5_000_000,
        rate_minor: null,
        percentage_bps: null,
        is_employer: false,
        is_variable: true,
        sort_order: 30,
      },
    ];
    const { adjustmentsByEmployee, variableLinesByEmployee } =
      buildCalculationAdjustmentsFromRunLines(runLines, new Map([["re-h", empId]]), componentById);

    const salaryLines: PayrollEmployeeSalaryLineRow[] = [
      {
        ...salaryLine(empId, hourlyId, 0),
        rate_minor: rateHourly,
        is_recurring: true,
      },
      {
        ...salaryLine(empId, otId, 0),
        rate_minor: rateOt,
        is_recurring: false,
      },
    ];

    const result = computeRunCalculation({
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currencyCode: USD,
      roundingMode: "half_up",
      workingDaysPerWeek: 5,
      workingHoursPerDay: 8,
      employees: [employeeRow(empId, "hourly")],
      allSalaryLines: salaryLines,
      components: hourlyComponents,
      adjustmentsByEmployee,
      variableLinesByEmployee,
    });

    const emp = result.employees.find((e) => e.employeeId === empId);
    expect(emp?.grossEarningsMinor).toBe(
      toMinorUnits("25", USD) * 40n + toMinorUnits("37.50", USD) * 5n,
    );
    expect(emp?.netPayMinor).toBe(emp?.grossEarningsMinor);
  });
});
