import { describe, expect, it } from "vitest";
import { payrollCalculationPreferences } from "./calculation-preferences";

describe("payroll calculation preferences", () => {
  it("passes the saved company rounding, work schedule, and currency into payroll calculations", () => {
    expect(
      payrollCalculationPreferences(
        {
          rounding_mode: "half_even",
          default_working_days_per_week: 4,
          default_working_hours_per_day: 7.5,
          payroll_currency: "inr",
        },
        "USD",
      ),
    ).toEqual({
      roundingMode: "half_even",
      workingDaysPerWeek: 4,
      workingHoursPerDay: 7.5,
      currencyCode: "INR",
    });
  });

  it("uses documented defaults for legacy rows and the run currency as fallback", () => {
    expect(payrollCalculationPreferences({}, "GBP")).toEqual({
      roundingMode: "half_up",
      workingDaysPerWeek: 5,
      workingHoursPerDay: 8,
      currencyCode: "GBP",
    });
  });

  it.each([
    [{ default_working_days_per_week: 0 }, "USD"],
    [{ default_working_hours_per_day: 25 }, "USD"],
    [{ payroll_currency: "US" }, "USD"],
    [{ rounding_mode: "banker's rounding" }, "USD"],
  ])("rejects malformed saved settings %o", (settings, fallback) => {
    expect(() => payrollCalculationPreferences(settings, fallback)).toThrow(/invalid/i);
  });
});
