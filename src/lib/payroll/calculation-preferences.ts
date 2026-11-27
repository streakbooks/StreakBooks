import { ROUNDING_MODES, type PayrollRoundingMode } from "@/lib/payroll/types";

export type PayrollCalculationPreferences = {
  roundingMode: PayrollRoundingMode;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  currencyCode: string;
};

/** Map the saved organisation payroll policy into the calculator's inputs. */
export function payrollCalculationPreferences(
  settings: Record<string, unknown>,
  fallbackCurrency: string,
): PayrollCalculationPreferences {
  const days = Number(settings["default_working_days_per_week"] ?? 5);
  const hours = Number(settings["default_working_hours_per_day"] ?? 8);
  if (!Number.isFinite(days) || days <= 0 || days > 7) {
    throw new Error("Payroll settings contain an invalid working-days value.");
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error("Payroll settings contain an invalid working-hours value.");
  }
  const currencyCode = String(settings["payroll_currency"] ?? fallbackCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Payroll settings contain an invalid currency.");
  }

  const savedRoundingMode = settings["rounding_mode"] ?? "half_up";
  if (
    typeof savedRoundingMode !== "string" ||
    !(ROUNDING_MODES as readonly string[]).includes(savedRoundingMode)
  ) {
    throw new Error("Payroll settings contain an invalid rounding mode.");
  }

  return {
    roundingMode: savedRoundingMode as PayrollRoundingMode,
    workingDaysPerWeek: days,
    workingHoursPerDay: hours,
    currencyCode,
  };
}
