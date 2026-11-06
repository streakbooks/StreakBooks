/**
 * Basic Global Payroll calculation engine (pure, bigint minor units).
 *
 * Mirrors future SQL posting logic; deterministic rules documented inline.
 *
 * Conventions
 *  - All money is integer minor units (see @/lib/accounting/money).
 *  - Hourly and unit quantities use micro-units (1 hour = 1_000_000).
 *  - Percentages use basis points (10_000 = 100%).
 *  - Earnings are signed positive; deductions are positive amounts subtracted from gross.
 *  - Net pay = gross earnings − employee deductions (may be negative if adjustments allow).
 *  - Employer contributions do not reduce net pay; total employer cost = gross + employer contributions.
 *  - Line order: non-percentage components by sort_order, then percentage components by sort_order.
 *  - Percentage bases: gross (all earnings), basic (BASIC code earnings only), taxable_earnings (taxable earnings).
 *  - Salaried proration: recurring fixed earnings for salaried employees scale by
 *    eligible working days ÷ working days in the full pay period.
 *    Eligible days = working days while employed in the period minus unpaid leave days (floor at 0).
 *  - Hourly recurring lines default to eligible working days × default hours per day when hours are omitted.
 *  - OVERTIME hourly lines use overtime hours from adjustments or line quantity (not default period hours).
 */

import { decimalPlacesFor } from "@/lib/accounting/money";
import type {
  PayrollCalculationMethod,
  PayrollComponentKind,
  PayrollEmploymentType,
  PayrollPercentageBase,
  PayrollRoundingMode,
} from "@/lib/payroll/types";

export const HOURS_MICRO_SCALE = 1_000_000n;
export const BPS_DENOMINATOR = 10_000n;

export type PayrollPeriodBounds = {
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  roundingMode: PayrollRoundingMode;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
};

export type LineInput = {
  lineId: string | null;
  componentTypeId: string;
  componentCode: string;
  kind: PayrollComponentKind;
  calculationMethod: PayrollCalculationMethod;
  percentageBase: PayrollPercentageBase | null;
  isTaxable: boolean;
  sortOrder: number;
  amountMinor: bigint;
  rateMinor: bigint;
  percentageBps: number;
  isRecurring: boolean;
  /** Hours or units in micro scale; optional per-period override. */
  quantityMicro?: bigint;
};

export type EmployeePeriodAdjustments = {
  unpaidLeaveDays?: number;
  regularHoursMicro?: bigint;
  overtimeHoursMicro?: bigint;
  /** componentTypeId → amount minor for manual / one-off overrides this period */
  manualAmountMinor?: Record<string, bigint>;
  /** componentTypeId → quantity micro for hourly / unit lines */
  quantityMicroByComponent?: Record<string, bigint>;
};

export type EmployeeCalcInput = {
  employeeId: string;
  employmentType: PayrollEmploymentType;
  hireDate: string;
  terminationDate: string | null;
  lines: LineInput[];
  adjustments?: EmployeePeriodAdjustments;
};

export type CalculationInput = PayrollPeriodBounds & {
  employees: EmployeeCalcInput[];
};

export type LineResult = {
  lineId: string | null;
  componentTypeId: string;
  componentCode: string;
  kind: PayrollComponentKind;
  calculationMethod: PayrollCalculationMethod;
  amountMinor: bigint;
  notes: string | null;
};

export type EmployeeResult = {
  employeeId: string;
  grossEarningsMinor: bigint;
  employeeDeductionsMinor: bigint;
  netPayMinor: bigint;
  employerContributionsMinor: bigint;
  totalEmployerCostMinor: bigint;
  basicEarningsMinor: bigint;
  taxableEarningsMinor: bigint;
  lines: LineResult[];
  proration: {
    periodWorkingDays: number;
    eligibleWorkingDays: number;
    unpaidLeaveDays: number;
  };
};

export type CalculationResult = {
  currencyCode: string;
  roundingMode: PayrollRoundingMode;
  employees: EmployeeResult[];
  totals: {
    grossEarningsMinor: bigint;
    employeeDeductionsMinor: bigint;
    netPayMinor: bigint;
    employerContributionsMinor: bigint;
    totalEmployerCostMinor: bigint;
  };
};

function parseDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function maxDate(a: string, b: string): string {
  return parseDateOnly(a) >= parseDateOnly(b) ? a : b;
}

function minDate(a: string, b: string): string {
  return parseDateOnly(a) <= parseDateOnly(b) ? a : b;
}

function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Monday = 0 … Sunday = 6 (UTC). */
function weekdayIndexUtc(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function isWorkingDayUtc(d: Date, workingDaysPerWeek: number): boolean {
  const w = weekdayIndexUtc(d);
  if (workingDaysPerWeek >= 7) return true;
  if (workingDaysPerWeek <= 0) return false;
  return w < workingDaysPerWeek;
}

/** Inclusive count of scheduled working days between two ISO dates. */
export function countWorkingDaysInRange(
  startIso: string,
  endIso: string,
  workingDaysPerWeek: number,
): number {
  if (parseDateOnly(startIso) > parseDateOnly(endIso)) return 0;
  let count = 0;
  let cursor = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  while (cursor <= end) {
    if (isWorkingDayUtc(cursor, workingDaysPerWeek)) count += 1;
    cursor = addDaysUtc(cursor, 1);
  }
  return count;
}

function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Divisor must be positive");
  const neg = numerator < 0n;
  const abs = neg ? -numerator : numerator;
  const q = (abs * 2n + denominator) / (denominator * 2n);
  return neg ? -q : q;
}

function roundHalfEvenDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Divisor must be positive");
  const neg = numerator < 0n;
  const abs = neg ? -numerator : numerator;
  const q = abs / denominator;
  const rem = abs % denominator;
  const twiceRem = rem * 2n;
  let rounded = q;
  if (twiceRem > denominator) {
    rounded += 1n;
  } else if (twiceRem === denominator) {
    if (q % 2n !== 0n) rounded += 1n;
  }
  return neg ? -rounded : rounded;
}

function roundFloorDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Divisor must be positive");
  if (numerator >= 0n) return numerator / denominator;
  const q = numerator / denominator;
  const rem = numerator % denominator;
  return rem === 0n ? q : q - 1n;
}

function roundCeilingDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Divisor must be positive");
  if (numerator <= 0n) return numerator / denominator;
  const q = numerator / denominator;
  const rem = numerator % denominator;
  return rem === 0n ? q : q + 1n;
}

/** Round a rational amount to whole minor units using payroll rounding mode. */
export function roundMinorUnits(
  numerator: bigint,
  denominator: bigint,
  mode: PayrollRoundingMode,
): bigint {
  switch (mode) {
    case "half_up":
      return roundHalfUpDiv(numerator, denominator);
    case "half_even":
      return roundHalfEvenDiv(numerator, denominator);
    case "floor":
      return roundFloorDiv(numerator, denominator);
    case "ceiling":
      return roundCeilingDiv(numerator, denominator);
    default:
      return roundHalfUpDiv(numerator, denominator);
  }
}

/**
 * Round a value already expressed in minor units (identity for integers).
 * `currencyDecimals` documents the currency scale for callers; minors are always whole.
 */
export function roundMinor(
  valueMinor: bigint,
  mode: PayrollRoundingMode,
  currencyDecimals: number,
): bigint {
  if (currencyDecimals < 0 || currencyDecimals > 4) {
    throw new Error("currencyDecimals must be between 0 and 4");
  }
  return valueMinor;
}

export type ProrationContext = {
  periodStart: string;
  periodEnd: string;
  hireDate: string;
  terminationDate: string | null;
  unpaidLeaveDays: number;
  workingDaysPerWeek: number;
};

export function prorationDays(ctx: ProrationContext): {
  periodWorkingDays: number;
  eligibleWorkingDays: number;
} {
  const periodWorkingDays = countWorkingDaysInRange(
    ctx.periodStart,
    ctx.periodEnd,
    ctx.workingDaysPerWeek,
  );
  const activeStart = maxDate(ctx.periodStart, ctx.hireDate);
  const activeEnd = minDate(ctx.periodEnd, ctx.terminationDate ?? ctx.periodEnd);
  let eligible = 0;
  if (parseDateOnly(activeStart) <= parseDateOnly(activeEnd)) {
    eligible = countWorkingDaysInRange(activeStart, activeEnd, ctx.workingDaysPerWeek);
  }
  const unpaid = Math.max(0, Math.floor(ctx.unpaidLeaveDays));
  eligible = Math.max(0, eligible - unpaid);
  if (periodWorkingDays > 0) {
    eligible = Math.min(eligible, periodWorkingDays);
  }
  return { periodWorkingDays, eligibleWorkingDays: eligible };
}

export function prorateSalariedAmount(
  fullPeriodAmountMinor: bigint,
  ctx: ProrationContext,
  roundingMode: PayrollRoundingMode,
): bigint {
  const { periodWorkingDays, eligibleWorkingDays } = prorationDays(ctx);
  if (periodWorkingDays <= 0 || eligibleWorkingDays <= 0) return 0n;
  if (eligibleWorkingDays === periodWorkingDays) return fullPeriodAmountMinor;
  return roundMinorUnits(
    fullPeriodAmountMinor * BigInt(eligibleWorkingDays),
    BigInt(periodWorkingDays),
    roundingMode,
  );
}

function lineQuantityMicro(
  line: LineInput,
  adjustments: EmployeePeriodAdjustments | undefined,
): bigint | undefined {
  const override = adjustments?.quantityMicroByComponent?.[line.componentTypeId];
  if (override !== undefined) return override;
  if (line.quantityMicro !== undefined) return line.quantityMicro;
  return undefined;
}

function manualOverrideMinor(
  line: LineInput,
  adjustments: EmployeePeriodAdjustments | undefined,
): bigint | undefined {
  return adjustments?.manualAmountMinor?.[line.componentTypeId];
}

function defaultRegularHoursMicro(eligibleWorkingDays: number, workingHoursPerDay: number): bigint {
  const hoursMicro = BigInt(eligibleWorkingDays) * BigInt(workingHoursPerDay) * HOURS_MICRO_SCALE;
  return hoursMicro;
}

function computeNonPercentageLineAmount(
  line: LineInput,
  input: EmployeeCalcInput,
  period: PayrollPeriodBounds,
  prorationCtx: ProrationContext,
  eligibleWorkingDays: number,
): { amountMinor: bigint; note: string | null } {
  const mode = period.roundingMode;
  const adj = input.adjustments;
  const manual = manualOverrideMinor(line, adj);
  if (manual !== undefined) {
    return { amountMinor: manual, note: "Manual period override" };
  }

  switch (line.calculationMethod) {
    case "manual":
      return { amountMinor: line.amountMinor, note: null };
    case "fixed": {
      let amount = line.amountMinor;
      const shouldProrate =
        line.kind === "earning" && line.isRecurring && input.employmentType === "salaried";
      if (shouldProrate) {
        amount = prorateSalariedAmount(amount, prorationCtx, mode);
      }
      return { amountMinor: amount, note: shouldProrate ? "Prorated fixed earning" : null };
    }
    case "hourly": {
      const code = line.componentCode.toUpperCase();
      let hoursMicro: bigint | undefined;
      if (code === "OVERTIME") {
        hoursMicro = adj?.overtimeHoursMicro ?? lineQuantityMicro(line, adj) ?? 0n;
      } else {
        hoursMicro =
          adj?.regularHoursMicro ??
          lineQuantityMicro(line, adj) ??
          (line.isRecurring
            ? defaultRegularHoursMicro(eligibleWorkingDays, period.workingHoursPerDay)
            : 0n);
      }
      const amount = roundMinorUnits(line.rateMinor * hoursMicro, HOURS_MICRO_SCALE, mode);
      return { amountMinor: amount, note: null };
    }
    case "unit": {
      const unitsMicro = lineQuantityMicro(line, adj) ?? 0n;
      const amount = roundMinorUnits(line.rateMinor * unitsMicro, HOURS_MICRO_SCALE, mode);
      return { amountMinor: amount, note: null };
    }
    case "percentage":
      return { amountMinor: 0n, note: "Calculated in second pass" };
    default:
      return { amountMinor: 0n, note: null };
  }
}

function percentageBaseAmount(
  base: PayrollPercentageBase,
  gross: bigint,
  basic: bigint,
  taxable: bigint,
): bigint {
  switch (base) {
    case "gross":
      return gross;
    case "basic":
      return basic;
    case "taxable_earnings":
      return taxable;
    default:
      return gross;
  }
}

function sortLines(lines: LineInput[]): LineInput[] {
  return [...lines].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.componentCode.localeCompare(b.componentCode),
  );
}

export function calculateEmployeePayroll(
  input: EmployeeCalcInput,
  period: PayrollPeriodBounds,
): EmployeeResult {
  const unpaidLeaveDays = Math.max(0, Math.floor(input.adjustments?.unpaidLeaveDays ?? 0));
  const prorationCtx: ProrationContext = {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    hireDate: input.hireDate,
    terminationDate: input.terminationDate,
    unpaidLeaveDays,
    workingDaysPerWeek: period.workingDaysPerWeek,
  };
  const { periodWorkingDays, eligibleWorkingDays } = prorationDays(prorationCtx);
  const mode = period.roundingMode;
  const ordered = sortLines(input.lines);

  const lineResults: LineResult[] = [];
  const nonPct: LineInput[] = [];
  const pct: LineInput[] = [];
  for (const line of ordered) {
    if (line.calculationMethod === "percentage") pct.push(line);
    else nonPct.push(line);
  }

  for (const line of nonPct) {
    const { amountMinor, note } = computeNonPercentageLineAmount(
      line,
      input,
      period,
      prorationCtx,
      eligibleWorkingDays,
    );
    lineResults.push({
      lineId: line.lineId,
      componentTypeId: line.componentTypeId,
      componentCode: line.componentCode,
      kind: line.kind,
      calculationMethod: line.calculationMethod,
      amountMinor,
      notes: note,
    });
  }

  const sumKind = (
    kind: PayrollComponentKind,
    pred?: (lr: LineResult, src: LineInput) => boolean,
  ) => {
    let total = 0n;
    for (const lr of lineResults) {
      if (lr.kind !== kind) continue;
      const src = ordered.find((l) => l.componentTypeId === lr.componentTypeId);
      if (pred && src && !pred(lr, src)) continue;
      total += lr.amountMinor;
    }
    return total;
  };

  let grossEarnings = sumKind("earning");
  let basicEarnings = 0n;
  for (const lr of lineResults) {
    if (lr.kind !== "earning") continue;
    if (lr.componentCode.toUpperCase() === "BASIC") basicEarnings += lr.amountMinor;
  }
  let taxableEarnings = 0n;
  for (const lr of lineResults) {
    if (lr.kind !== "earning") continue;
    const src = ordered.find((l) => l.componentTypeId === lr.componentTypeId);
    if (src?.isTaxable) taxableEarnings += lr.amountMinor;
  }

  for (const line of pct) {
    const baseKey = line.percentageBase ?? "gross";
    const base = percentageBaseAmount(baseKey, grossEarnings, basicEarnings, taxableEarnings);
    const manual = manualOverrideMinor(line, input.adjustments);
    const amountMinor =
      manual !== undefined
        ? manual
        : roundMinorUnits(base * BigInt(line.percentageBps), BPS_DENOMINATOR, mode);
    lineResults.push({
      lineId: line.lineId,
      componentTypeId: line.componentTypeId,
      componentCode: line.componentCode,
      kind: line.kind,
      calculationMethod: line.calculationMethod,
      amountMinor,
      notes: manual !== undefined ? "Manual period override" : null,
    });
    if (line.kind === "deduction") {
      // deductions only
    } else if (line.kind === "earning") {
      grossEarnings += amountMinor;
      if (line.componentCode.toUpperCase() === "BASIC") basicEarnings += amountMinor;
      if (line.isTaxable) taxableEarnings += amountMinor;
    }
  }

  grossEarnings = sumKind("earning");
  basicEarnings = 0n;
  taxableEarnings = 0n;
  for (const lr of lineResults) {
    if (lr.kind !== "earning") continue;
    if (lr.componentCode.toUpperCase() === "BASIC") basicEarnings += lr.amountMinor;
    const src = ordered.find((l) => l.componentTypeId === lr.componentTypeId);
    if (src?.isTaxable) taxableEarnings += lr.amountMinor;
  }

  const employeeDeductions = sumKind("deduction");
  const employerContributions = sumKind("employer_contribution");
  const netPay = grossEarnings - employeeDeductions;
  const totalEmployerCost = grossEarnings + employerContributions;

  return {
    employeeId: input.employeeId,
    grossEarningsMinor: grossEarnings,
    employeeDeductionsMinor: employeeDeductions,
    netPayMinor: netPay,
    employerContributionsMinor: employerContributions,
    totalEmployerCostMinor: totalEmployerCost,
    basicEarningsMinor: basicEarnings,
    taxableEarningsMinor: taxableEarnings,
    lines: lineResults,
    proration: {
      periodWorkingDays,
      eligibleWorkingDays,
      unpaidLeaveDays,
    },
  };
}

export function calculatePayrollRun(input: CalculationInput): CalculationResult {
  const currencyDecimals = decimalPlacesFor(input.currencyCode);
  if (currencyDecimals < 0) throw new Error("Invalid currency");
  void roundMinor(0n, input.roundingMode, currencyDecimals);

  const employees = input.employees.map((emp) => calculateEmployeePayroll(emp, input));
  const totals = employees.reduce(
    (acc, emp) => ({
      grossEarningsMinor: acc.grossEarningsMinor + emp.grossEarningsMinor,
      employeeDeductionsMinor: acc.employeeDeductionsMinor + emp.employeeDeductionsMinor,
      netPayMinor: acc.netPayMinor + emp.netPayMinor,
      employerContributionsMinor: acc.employerContributionsMinor + emp.employerContributionsMinor,
      totalEmployerCostMinor: acc.totalEmployerCostMinor + emp.totalEmployerCostMinor,
    }),
    {
      grossEarningsMinor: 0n,
      employeeDeductionsMinor: 0n,
      netPayMinor: 0n,
      employerContributionsMinor: 0n,
      totalEmployerCostMinor: 0n,
    },
  );

  return {
    currencyCode: input.currencyCode,
    roundingMode: input.roundingMode,
    employees,
    totals,
  };
}
