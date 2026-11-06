import { describe, expect, it } from "vitest";
import { toMinorUnits } from "@/lib/accounting/money";
import {
  calculateEmployeePayroll,
  calculatePayrollRun,
  countWorkingDaysInRange,
  prorateSalariedAmount,
  roundMinorUnits,
  type EmployeeCalcInput,
  type LineInput,
  type PayrollPeriodBounds,
} from "@/lib/payroll/calculation-engine";

const USD = "USD";
const JPY = "JPY";
const KWD = "KWD";

function period(over: Partial<PayrollPeriodBounds> = {}): PayrollPeriodBounds {
  return {
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    currencyCode: USD,
    roundingMode: "half_up",
    workingDaysPerWeek: 5,
    workingHoursPerDay: 8,
    ...over,
  };
}

function line(
  over: Partial<LineInput> & Pick<LineInput, "componentTypeId" | "componentCode">,
): LineInput {
  return {
    lineId: null,
    kind: "earning",
    calculationMethod: "fixed",
    percentageBase: null,
    isTaxable: true,
    sortOrder: 100,
    amountMinor: 0n,
    rateMinor: 0n,
    percentageBps: 0,
    isRecurring: true,
    ...over,
  };
}

function employee(
  over: Partial<EmployeeCalcInput> & Pick<EmployeeCalcInput, "employeeId">,
): EmployeeCalcInput {
  return {
    employmentType: "salaried",
    hireDate: "2020-01-01",
    terminationDate: null,
    lines: [],
    ...over,
  };
}

describe("roundMinorUnits", () => {
  it("half_up rounds away from zero at half", () => {
    expect(roundMinorUnits(5n, 2n, "half_up")).toBe(3n);
    expect(roundMinorUnits(-5n, 2n, "half_up")).toBe(-3n);
  });
  it("half_even uses bankers rounding", () => {
    expect(roundMinorUnits(5n, 2n, "half_even")).toBe(2n);
    expect(roundMinorUnits(15n, 2n, "half_even")).toBe(8n);
    expect(roundMinorUnits(25n, 2n, "half_even")).toBe(12n);
  });
  it("floor and ceiling follow toward infinity rules", () => {
    expect(roundMinorUnits(7n, 3n, "floor")).toBe(2n);
    expect(roundMinorUnits(-7n, 3n, "floor")).toBe(-3n);
    expect(roundMinorUnits(7n, 3n, "ceiling")).toBe(3n);
    expect(roundMinorUnits(-7n, 3n, "ceiling")).toBe(-2n);
  });
});

describe("proration", () => {
  it("counts Mon–Fri working days in March 2026", () => {
    expect(countWorkingDaysInRange("2026-03-01", "2026-03-31", 5)).toBe(22);
  });

  it("prorates mid-period hire for salaried basic pay", () => {
    const monthly = toMinorUnits("6000", USD);
    const amount = prorateSalariedAmount(
      monthly,
      {
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31",
        hireDate: "2026-03-16",
        terminationDate: null,
        unpaidLeaveDays: 0,
        workingDaysPerWeek: 5,
      },
      "half_up",
    );
    const fullDays = countWorkingDaysInRange("2026-03-01", "2026-03-31", 5);
    const partialDays = countWorkingDaysInRange("2026-03-16", "2026-03-31", 5);
    const expected = roundMinorUnits(monthly * BigInt(partialDays), BigInt(fullDays), "half_up");
    expect(amount).toBe(expected);
    expect(amount).toBeLessThan(monthly);
  });

  it("reduces eligible days for unpaid leave", () => {
    const monthly = toMinorUnits("3000", USD);
    const withoutLeave = prorateSalariedAmount(
      monthly,
      {
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31",
        hireDate: "2026-03-01",
        terminationDate: null,
        unpaidLeaveDays: 0,
        workingDaysPerWeek: 5,
      },
      "half_up",
    );
    const withLeave = prorateSalariedAmount(
      monthly,
      {
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31",
        hireDate: "2026-03-01",
        terminationDate: null,
        unpaidLeaveDays: 3,
        workingDaysPerWeek: 5,
      },
      "half_up",
    );
    expect(withLeave).toBeLessThan(withoutLeave);
  });
});

describe("calculateEmployeePayroll", () => {
  it("returns zero net for zero earnings and no deductions", () => {
    const result = calculateEmployeePayroll(employee({ employeeId: "e1", lines: [] }), period());
    expect(result.grossEarningsMinor).toBe(0n);
    expect(result.netPayMinor).toBe(0n);
    expect(result.totalEmployerCostMinor).toBe(0n);
  });

  it("computes hourly wages and overtime", () => {
    const hourlyId = "c-hourly";
    const otId = "c-ot";
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        employmentType: "hourly",
        lines: [
          line({
            componentTypeId: hourlyId,
            componentCode: "HOURLY",
            calculationMethod: "hourly",
            rateMinor: toMinorUnits("25", USD),
            sortOrder: 20,
          }),
          line({
            componentTypeId: otId,
            componentCode: "OVERTIME",
            calculationMethod: "hourly",
            rateMinor: toMinorUnits("37.50", USD),
            isRecurring: false,
            sortOrder: 30,
          }),
        ],
        adjustments: {
          regularHoursMicro: 40n * 1_000_000n,
          overtimeHoursMicro: 5n * 1_000_000n,
        },
      }),
      period(),
    );
    expect(result.grossEarningsMinor).toBe(
      toMinorUnits("25", USD) * 40n + toMinorUnits("37.50", USD) * 5n,
    );
    expect(result.netPayMinor).toBe(result.grossEarningsMinor);
  });

  it("applies percentage deduction on gross", () => {
    const basicId = "c-basic";
    const pctId = "c-pct";
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: basicId,
            componentCode: "BASIC",
            amountMinor: toMinorUnits("2000", USD),
            sortOrder: 10,
          }),
          line({
            componentTypeId: "c-bonus",
            componentCode: "BONUS",
            calculationMethod: "manual",
            amountMinor: toMinorUnits("500", USD),
            isRecurring: false,
            sortOrder: 40,
          }),
          line({
            componentTypeId: pctId,
            componentCode: "PCT_DED",
            kind: "deduction",
            calculationMethod: "percentage",
            percentageBase: "gross",
            percentageBps: 1000,
            isTaxable: false,
            sortOrder: 140,
          }),
        ],
      }),
      period(),
    );
    expect(result.grossEarningsMinor).toBe(toMinorUnits("2500", USD));
    expect(result.employeeDeductionsMinor).toBe(toMinorUnits("250", USD));
    expect(result.netPayMinor).toBe(toMinorUnits("2250", USD));
  });

  it("uses basic base for percentage when configured", () => {
    const pctId = "c-pct-basic";
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: "c-basic",
            componentCode: "BASIC",
            amountMinor: toMinorUnits("1000", USD),
          }),
          line({
            componentTypeId: "c-allow",
            componentCode: "ALLOWANCE",
            amountMinor: toMinorUnits("200", USD),
            isTaxable: false,
            sortOrder: 60,
          }),
          line({
            componentTypeId: pctId,
            componentCode: "PCT_DED",
            kind: "deduction",
            calculationMethod: "percentage",
            percentageBase: "basic",
            percentageBps: 5000,
            isTaxable: false,
            sortOrder: 140,
          }),
        ],
      }),
      period(),
    );
    expect(result.employeeDeductionsMinor).toBe(toMinorUnits("500", USD));
  });

  it("includes employer contributions in employer cost only", () => {
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: "c-basic",
            componentCode: "BASIC",
            amountMinor: toMinorUnits("1000", USD),
          }),
          line({
            componentTypeId: "c-er",
            componentCode: "ER_CONTRIB",
            kind: "employer_contribution",
            calculationMethod: "manual",
            amountMinor: toMinorUnits("120", USD),
            isTaxable: false,
            sortOrder: 210,
          }),
        ],
      }),
      period(),
    );
    expect(result.netPayMinor).toBe(toMinorUnits("1000", USD));
    expect(result.employerContributionsMinor).toBe(toMinorUnits("120", USD));
    expect(result.totalEmployerCostMinor).toBe(toMinorUnits("1120", USD));
  });

  it("allows negative manual adjustment on earnings", () => {
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: "c-basic",
            componentCode: "BASIC",
            amountMinor: toMinorUnits("1000", USD),
          }),
          line({
            componentTypeId: "c-adj",
            componentCode: "REIMBURSEMENT",
            calculationMethod: "manual",
            amountMinor: toMinorUnits("100", USD),
            isRecurring: false,
          }),
        ],
        adjustments: {
          manualAmountMinor: { "c-adj": toMinorUnits("-50", USD) },
        },
      }),
      period(),
    );
    expect(result.grossEarningsMinor).toBe(toMinorUnits("950", USD));
  });

  it("handles loan and advance repayments as deductions", () => {
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: "c-basic",
            componentCode: "BASIC",
            amountMinor: toMinorUnits("2000", USD),
          }),
          line({
            componentTypeId: "c-loan",
            componentCode: "LOAN_REPAY",
            kind: "deduction",
            calculationMethod: "fixed",
            amountMinor: toMinorUnits("150", USD),
            isTaxable: false,
            sortOrder: 150,
          }),
          line({
            componentTypeId: "c-adv",
            componentCode: "ADVANCE_REPAY",
            kind: "deduction",
            calculationMethod: "fixed",
            amountMinor: toMinorUnits("100", USD),
            isTaxable: false,
            sortOrder: 160,
          }),
        ],
      }),
      period(),
    );
    expect(result.employeeDeductionsMinor).toBe(toMinorUnits("250", USD));
    expect(result.netPayMinor).toBe(toMinorUnits("1750", USD));
  });

  it("respects half_even rounding on percentage deductions", () => {
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: "c-basic",
            componentCode: "BASIC",
            amountMinor: 10003n,
          }),
          line({
            componentTypeId: "c-pct",
            componentCode: "PCT_DED",
            kind: "deduction",
            calculationMethod: "percentage",
            percentageBase: "gross",
            percentageBps: 100,
            isTaxable: false,
          }),
        ],
      }),
      period({ roundingMode: "half_even" }),
    );
    expect(result.employeeDeductionsMinor).toBe(100n);
  });
});

describe("currency precision", () => {
  it("calculates JPY with zero decimal places", () => {
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        lines: [
          line({
            componentTypeId: "c-basic",
            componentCode: "BASIC",
            amountMinor: toMinorUnits("300000", JPY),
          }),
        ],
      }),
      period({ currencyCode: JPY }),
    );
    expect(result.grossEarningsMinor).toBe(300_000n);
  });

  it("calculates KWD hourly rate with three decimal places", () => {
    const rate = toMinorUnits("12.345", KWD);
    const result = calculateEmployeePayroll(
      employee({
        employeeId: "e1",
        employmentType: "hourly",
        lines: [
          line({
            componentTypeId: "c-hourly",
            componentCode: "HOURLY",
            calculationMethod: "hourly",
            rateMinor: rate,
          }),
        ],
        adjustments: { regularHoursMicro: 10n * 1_000_000n },
      }),
      period({ currencyCode: KWD }),
    );
    expect(result.grossEarningsMinor).toBe(rate * 10n);
  });
});

describe("calculatePayrollRun", () => {
  it("aggregates deterministic totals across employees", () => {
    const run = calculatePayrollRun({
      ...period(),
      employees: [
        employee({
          employeeId: "e1",
          lines: [
            line({
              componentTypeId: "c1",
              componentCode: "BASIC",
              amountMinor: toMinorUnits("1000", USD),
            }),
          ],
        }),
        employee({
          employeeId: "e2",
          lines: [
            line({
              componentTypeId: "c2",
              componentCode: "BASIC",
              amountMinor: toMinorUnits("1500", USD),
            }),
          ],
        }),
      ],
    });
    expect(run.totals.grossEarningsMinor).toBe(toMinorUnits("2500", USD));
    expect(run.totals.netPayMinor).toBe(toMinorUnits("2500", USD));
    expect(run.employees).toHaveLength(2);
  });
});
