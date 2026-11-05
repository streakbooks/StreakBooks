/** Shared Basic Global Payroll domain types (Batch 1 foundation). */

export const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAYMENT_METHODS = ["bank_transfer", "cash", "cheque", "other"] as const;
export type PayrollPaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ROUNDING_MODES = ["half_up", "half_even", "floor", "ceiling"] as const;
export type PayrollRoundingMode = (typeof ROUNDING_MODES)[number];

export const COMPONENT_KINDS = ["earning", "deduction", "employer_contribution"] as const;
export type PayrollComponentKind = (typeof COMPONENT_KINDS)[number];

export const CALCULATION_METHODS = ["fixed", "percentage", "hourly", "unit", "manual"] as const;
export type PayrollCalculationMethod = (typeof CALCULATION_METHODS)[number];

export const PERCENTAGE_BASES = ["gross", "basic", "taxable_earnings"] as const;
export type PayrollPercentageBase = (typeof PERCENTAGE_BASES)[number];

export type PayrollSettingsRow = {
  company_id: string;
  enabled: boolean;
  operating_country_code: string;
  payroll_currency: string;
  default_pay_schedule_id: string | null;
  payroll_start_date: string | null;
  default_working_days_per_week: number;
  default_working_hours_per_day: number;
  payment_date_offset_days: number;
  salary_expense_account_id: string | null;
  net_pay_liability_account_id: string | null;
  deduction_liability_account_id: string | null;
  employer_expense_account_id: string | null;
  employer_liability_account_id: string | null;
  default_payment_method: PayrollPaymentMethod;
  requires_approval: boolean;
  rounding_mode: PayrollRoundingMode;
  payslip_show_employer_costs: boolean;
  payslip_footer_note: string | null;
  payslip_branding_name: string | null;
  employee_number_prefix: string;
  next_employee_number: number;
  disclaimer_acknowledged: boolean;
  version: number;
};

export type PayrollPayScheduleRow = {
  id: string;
  company_id: string;
  name: string;
  frequency: PayFrequency;
  anchor_date: string;
  payment_offset_days: number;
  is_default: boolean;
  is_active: boolean;
};

export type PayrollComponentTypeRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  kind: PayrollComponentKind;
  calculation_method: PayrollCalculationMethod;
  percentage_base: PayrollPercentageBase | null;
  is_taxable: boolean;
  is_recurring_default: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  expense_account_id: string | null;
  liability_account_id: string | null;
};

export type PayrollDocumentSequenceRow = {
  document_type: "payroll_run" | "payslip";
  prefix: string;
  next_number: number;
  padding: number;
};

export type PayrollSettingsPage = {
  available: boolean;
  company: {
    id: string;
    name: string;
    country_code: string;
    base_currency: string;
  };
  settings: PayrollSettingsRow | null;
  schedules: PayrollPayScheduleRow[];
  components: PayrollComponentTypeRow[];
  sequences: PayrollDocumentSequenceRow[];
  disclaimer: string;
};

export const BASIC_PAYROLL_DISCLAIMER =
  "Basic Global Payroll calculates pay from configured earnings and deductions. It does not automatically compute statutory income tax, social security or government filings. Enter statutory amounts manually when required. It is not advertised as legally compliant in every country.";
