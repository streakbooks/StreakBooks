import { describe, expect, it } from "vitest";
import {
  parseComponentDraft,
  parsePayScheduleDraft,
  parsePayrollSettingsDraft,
} from "./settings-draft";

describe("payroll settings drafts", () => {
  it("requires disclaimer acknowledgement before enablement", () => {
    const parsed = parsePayrollSettingsDraft({
      enabled: true,
      operatingCountryCode: "GB",
      payrollCurrency: "GBP",
      defaultPayScheduleId: "",
      payrollStartDate: "2026-01-01",
      defaultWorkingDaysPerWeek: "5",
      defaultWorkingHoursPerDay: "8",
      paymentDateOffsetDays: "0",
      salaryExpenseAccountId: "11111111-1111-1111-1111-111111111111",
      netPayLiabilityAccountId: "22222222-2222-2222-2222-222222222222",
      deductionLiabilityAccountId: "33333333-3333-3333-3333-333333333333",
      employerExpenseAccountId: "",
      employerLiabilityAccountId: "",
      defaultPaymentMethod: "bank_transfer",
      requiresApproval: true,
      roundingMode: "half_up",
      payslipShowEmployerCosts: false,
      payslipFooterNote: "",
      payslipBrandingName: "",
      employeeNumberPrefix: "EMP-",
      disclaimerAcknowledged: false,
      version: 1,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/disclaimer/i);
  });

  it("accepts a valid enabled settings draft", () => {
    const parsed = parsePayrollSettingsDraft({
      enabled: true,
      operatingCountryCode: "au",
      payrollCurrency: "aud",
      defaultPayScheduleId: "44444444-4444-4444-4444-444444444444",
      payrollStartDate: "2026-04-01",
      defaultWorkingDaysPerWeek: "5",
      defaultWorkingHoursPerDay: "7.5",
      paymentDateOffsetDays: "3",
      salaryExpenseAccountId: "11111111-1111-1111-1111-111111111111",
      netPayLiabilityAccountId: "22222222-2222-2222-2222-222222222222",
      deductionLiabilityAccountId: "33333333-3333-3333-3333-333333333333",
      employerExpenseAccountId: "",
      employerLiabilityAccountId: "",
      defaultPaymentMethod: "bank_transfer",
      requiresApproval: true,
      roundingMode: "half_even",
      payslipShowEmployerCosts: true,
      payslipFooterNote: "Manual statutory amounts only",
      payslipBrandingName: "LinkBooks Demo",
      employeeNumberPrefix: "E-",
      disclaimerAcknowledged: true,
      version: 2,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value["operating_country_code"]).toBe("AU");
    expect(parsed.value["payroll_currency"]).toBe("AUD");
    expect(parsed.value["rounding_mode"]).toBe("half_even");
  });

  it("validates pay schedules and percentage components", () => {
    expect(
      parsePayScheduleDraft({
        name: "Monthly",
        frequency: "monthly",
        anchorDate: "2026-01-01",
        paymentOffsetDays: "0",
        isDefault: true,
        isActive: true,
      }).ok,
    ).toBe(true);

    const badPct = parseComponentDraft({
      code: "PCT",
      name: "Percent",
      kind: "deduction",
      calculationMethod: "percentage",
      percentageBase: "",
      isTaxable: false,
      isRecurringDefault: true,
      isActive: true,
      sortOrder: "10",
      expenseAccountId: "",
      liabilityAccountId: "",
    });
    expect(badPct.ok).toBe(false);

    const goodPct = parseComponentDraft({
      code: "pct",
      name: "Percent",
      kind: "deduction",
      calculationMethod: "percentage",
      percentageBase: "gross",
      isTaxable: false,
      isRecurringDefault: true,
      isActive: true,
      sortOrder: "10",
      expenseAccountId: "",
      liabilityAccountId: "",
    });
    expect(goodPct.ok).toBe(true);
    if (goodPct.ok) expect(goodPct.value["code"]).toBe("PCT");
  });
  it("rejects a default manual method excluded by the payroll settings SQL check", () => {
    const parsed = parsePayrollSettingsDraft({
      enabled: false,
      operatingCountryCode: "GB",
      payrollCurrency: "GBP",
      defaultPayScheduleId: "",
      payrollStartDate: "",
      defaultWorkingDaysPerWeek: "5",
      defaultWorkingHoursPerDay: "8",
      paymentDateOffsetDays: "0",
      salaryExpenseAccountId: "",
      netPayLiabilityAccountId: "",
      deductionLiabilityAccountId: "",
      employerExpenseAccountId: "",
      employerLiabilityAccountId: "",
      defaultPaymentMethod: "manual" as never,
      requiresApproval: true,
      roundingMode: "half_up",
      payslipShowEmployerCosts: false,
      payslipFooterNote: "",
      payslipBrandingName: "",
      employeeNumberPrefix: "EMP-",
      disclaimerAcknowledged: false,
      version: null,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/payment method/);
  });

});
