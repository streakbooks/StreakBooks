import {
  CALCULATION_METHODS,
  COMPONENT_KINDS,
  PAYMENT_METHODS,
  PAY_FREQUENCIES,
  PERCENTAGE_BASES,
  ROUNDING_MODES,
  type PayrollCalculationMethod,
  type PayrollComponentKind,
  type PayrollPaymentMethod,
  type PayrollPercentageBase,
  type PayrollRoundingMode,
  type PayFrequency,
} from "@/lib/payroll/types";

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

export type PayrollSettingsDraft = {
  enabled: boolean;
  operatingCountryCode: string;
  payrollCurrency: string;
  defaultPayScheduleId: string;
  payrollStartDate: string;
  defaultWorkingDaysPerWeek: string;
  defaultWorkingHoursPerDay: string;
  paymentDateOffsetDays: string;
  salaryExpenseAccountId: string;
  netPayLiabilityAccountId: string;
  deductionLiabilityAccountId: string;
  employerExpenseAccountId: string;
  employerLiabilityAccountId: string;
  defaultPaymentMethod: PayrollPaymentMethod;
  requiresApproval: boolean;
  roundingMode: PayrollRoundingMode;
  payslipShowEmployerCosts: boolean;
  payslipFooterNote: string;
  payslipBrandingName: string;
  employeeNumberPrefix: string;
  disclaimerAcknowledged: boolean;
  version: number | null;
};

export type ParsedPayrollSettings =
  { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

export function parsePayrollSettingsDraft(draft: PayrollSettingsDraft): ParsedPayrollSettings {
  const country = draft.operatingCountryCode.trim().toUpperCase();
  const currency = draft.payrollCurrency.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country))
    return { ok: false, error: "Operating country must be a 2-letter code." };
  if (!/^[A-Z]{3}$/.test(currency))
    return { ok: false, error: "Payroll currency must be a 3-letter code." };

  const days = Number(draft.defaultWorkingDaysPerWeek);
  const hours = Number(draft.defaultWorkingHoursPerDay);
  const offset = Number(draft.paymentDateOffsetDays);
  if (!Number.isFinite(days) || days <= 0 || days > 7) {
    return { ok: false, error: "Working days per week must be between 0 and 7." };
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { ok: false, error: "Working hours per day must be between 0 and 24." };
  }
  if (!Number.isInteger(offset) || offset < -31 || offset > 62) {
    return { ok: false, error: "Payment date offset must be a whole number between -31 and 62." };
  }

  const prefix = draft.employeeNumberPrefix.trim() || "EMP-";
  if (prefix.length > 12) return { ok: false, error: "Employee number prefix is too long." };

  if (draft.enabled && !draft.disclaimerAcknowledged) {
    return {
      ok: false,
      error: "Acknowledge the Basic Payroll compliance disclaimer before enabling payroll.",
    };
  }
  if (
    draft.enabled &&
    (!draft.salaryExpenseAccountId ||
      !draft.netPayLiabilityAccountId ||
      !draft.deductionLiabilityAccountId)
  ) {
    return {
      ok: false,
      error:
        "Salary expense, net pay liability and deduction liability accounts are required when payroll is enabled.",
    };
  }

  return {
    ok: true,
    value: {
      enabled: draft.enabled,
      operating_country_code: country,
      payroll_currency: currency,
      default_pay_schedule_id: draft.defaultPayScheduleId || null,
      payroll_start_date: draft.payrollStartDate || null,
      default_working_days_per_week: days,
      default_working_hours_per_day: hours,
      payment_date_offset_days: offset,
      salary_expense_account_id: draft.salaryExpenseAccountId || null,
      net_pay_liability_account_id: draft.netPayLiabilityAccountId || null,
      deduction_liability_account_id: draft.deductionLiabilityAccountId || null,
      employer_expense_account_id: draft.employerExpenseAccountId || null,
      employer_liability_account_id: draft.employerLiabilityAccountId || null,
      default_payment_method: draft.defaultPaymentMethod,
      requires_approval: draft.requiresApproval,
      rounding_mode: draft.roundingMode,
      payslip_show_employer_costs: draft.payslipShowEmployerCosts,
      payslip_footer_note: draft.payslipFooterNote.trim() || null,
      payslip_branding_name: draft.payslipBrandingName.trim() || null,
      employee_number_prefix: prefix,
      disclaimer_acknowledged: draft.disclaimerAcknowledged,
      version: draft.version,
    },
  };
}

export type PayScheduleDraft = {
  id?: string;
  name: string;
  frequency: string;
  anchorDate: string;
  paymentOffsetDays: string;
  isDefault: boolean;
  isActive: boolean;
};

export function parsePayScheduleDraft(
  draft: PayScheduleDraft,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name || name.length > 120) return { ok: false, error: "Pay schedule name is required." };
  if (!isOneOf(draft.frequency, PAY_FREQUENCIES)) {
    return { ok: false, error: "Choose a valid pay frequency." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.anchorDate)) {
    return { ok: false, error: "Anchor date must be YYYY-MM-DD." };
  }
  const offset = Number(draft.paymentOffsetDays);
  if (!Number.isInteger(offset) || offset < -31 || offset > 62) {
    return { ok: false, error: "Payment offset must be a whole number between -31 and 62." };
  }
  return {
    ok: true,
    value: {
      id: draft.id ?? null,
      name,
      frequency: draft.frequency as PayFrequency,
      anchor_date: draft.anchorDate,
      payment_offset_days: offset,
      is_default: draft.isDefault,
      is_active: draft.isActive,
    },
  };
}

export type ComponentDraft = {
  id?: string;
  code: string;
  name: string;
  kind: string;
  calculationMethod: string;
  percentageBase: string;
  isTaxable: boolean;
  isRecurringDefault: boolean;
  isActive: boolean;
  sortOrder: string;
  expenseAccountId: string;
  liabilityAccountId: string;
};

export function parseComponentDraft(
  draft: ComponentDraft,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const code = draft.code.trim().toUpperCase();
  const name = draft.name.trim();
  if (!code || code.length > 40) return { ok: false, error: "Component code is required." };
  if (!name || name.length > 120) return { ok: false, error: "Component name is required." };
  if (!isOneOf(draft.kind, COMPONENT_KINDS))
    return { ok: false, error: "Choose a component kind." };
  if (!isOneOf(draft.calculationMethod, CALCULATION_METHODS)) {
    return { ok: false, error: "Choose a calculation method." };
  }
  let percentageBase: PayrollPercentageBase | null = null;
  if (draft.calculationMethod === "percentage") {
    if (!isOneOf(draft.percentageBase, PERCENTAGE_BASES)) {
      return { ok: false, error: "Percentage components require a percentage base." };
    }
    percentageBase = draft.percentageBase;
  }
  const sortOrder = Number(draft.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    return { ok: false, error: "Sort order must be a whole number between 0 and 100000." };
  }
  return {
    ok: true,
    value: {
      id: draft.id ?? null,
      code,
      name,
      kind: draft.kind as PayrollComponentKind,
      calculation_method: draft.calculationMethod as PayrollCalculationMethod,
      percentage_base: percentageBase,
      is_taxable: draft.isTaxable,
      is_recurring_default: draft.isRecurringDefault,
      is_active: draft.isActive,
      sort_order: sortOrder,
      expense_account_id: draft.expenseAccountId || null,
      liability_account_id: draft.liabilityAccountId || null,
    },
  };
}

export function assertPaymentMethod(value: string): PayrollPaymentMethod {
  return isOneOf(value, PAYMENT_METHODS) ? value : "bank_transfer";
}

export function assertRoundingMode(value: string): PayrollRoundingMode {
  return isOneOf(value, ROUNDING_MODES) ? value : "half_up";
}
