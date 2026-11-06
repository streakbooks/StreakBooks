/** Shared Basic Global Payroll domain types (Batch 1 foundation). */

import type { PayslipSnapshot } from "@/lib/payroll/payslip-snapshot";

export const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** Allowed on employee records and organisation payroll settings.
 * The SQL CHECK constraints intentionally exclude 'manual' here; manual
 * confirmation remains a supported payment *settlement* method.
 */
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

export const EMPLOYEE_STATUSES = ["active", "archived", "terminated"] as const;
export type PayrollEmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["salaried", "hourly", "contractor", "other"] as const;
export type PayrollEmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export type PayrollEmployeeRow = {
  id: string;
  company_id: string;
  contact_id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: PayrollEmployeeStatus;
  hire_date: string;
  termination_date: string | null;
  department: string | null;
  designation: string | null;
  employment_type: PayrollEmploymentType;
  work_location: string | null;
  payroll_country_code: string;
  payroll_currency: string;
  pay_schedule_id: string | null;
  salary_structure_id: string | null;
  payment_method: PayrollPaymentMethod;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollEmployeePaymentMasked = {
  account_name: string | null;
  bank_name: string | null;
  account_number_masked: string | null;
  sort_code_masked: string | null;
  iban_masked: string | null;
  bic: string | null;
  has_account_number: boolean;
  has_sort_code: boolean;
  has_iban: boolean;
};

export type PayrollSalaryStructureRow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PayrollSalaryStructureLineRow = {
  id: string;
  company_id: string;
  structure_id: string;
  component_type_id: string;
  amount_minor: number;
  rate_minor: number;
  percentage_bps: number;
  is_recurring: boolean;
  sort_order: number;
};

export type PayrollEmployeeSalaryVersionRow = {
  id: string;
  company_id: string;
  employee_id: string;
  structure_id: string | null;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  created_at: string;
};

export type PayrollEmployeeSalaryLineRow = {
  id: string;
  company_id: string;
  employee_id: string;
  version_id: string;
  component_type_id: string;
  amount_minor: number;
  rate_minor: number;
  percentage_bps: number;
  is_recurring: boolean;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
};

export type PayrollEmployeePage = {
  available: true;
  employee: PayrollEmployeeRow;
  payment: PayrollEmployeePaymentMasked | null;
  salary_versions: PayrollEmployeeSalaryVersionRow[];
  salary_lines: PayrollEmployeeSalaryLineRow[];
  structures: PayrollSalaryStructureRow[];
  schedules: PayrollPayScheduleRow[];
  components: PayrollComponentTypeRow[];
};

export type PayrollEmployeesListPage = {
  available: boolean;
  employees: PayrollEmployeeRow[];
  migrationMessage: string | null;
};

export type PayrollSalaryStructuresPage = {
  available: boolean;
  structures: PayrollSalaryStructureRow[];
  lines: PayrollSalaryStructureLineRow[];
  migrationMessage: string | null;
};

/** Batch 3 — calculation preview (amounts are integer minor units at the API boundary). */
export type PayrollCalculationPreviewTotals = {
  grossEarningsMinor: number;
  employeeDeductionsMinor: number;
  netPayMinor: number;
  employerContributionsMinor: number;
  totalEmployerCostMinor: number;
};

export const PAYROLL_RUN_STATUSES = [
  "draft",
  "calculated",
  "reviewed",
  "approved",
  "posted",
  "paid",
  "complete",
  "void",
] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYSLIP_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export type PayslipPaymentStatus = (typeof PAYSLIP_PAYMENT_STATUSES)[number];

export type PayrollRunRow = {
  id: string;
  company_id: string;
  run_number: string;
  pay_schedule_id: string;
  period_start: string;
  period_end: string;
  payment_date: string;
  status: PayrollRunStatus;
  currency: string;
  gross_minor: number;
  deductions_minor: number;
  net_minor: number;
  employer_minor: number;
  employer_cost_minor: number;
  net_paid_minor: number;
  accrual_journal_id: string | null;
  posted_at: string | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  calculated_at: string | null;
  reviewed_at: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollRunEmployeeRow = {
  id: string;
  company_id: string;
  run_id: string;
  employee_id: string;
  status: "included" | "excluded" | "error";
  gross_minor: number;
  deductions_minor: number;
  net_minor: number;
  employer_minor: number;
  employer_cost_minor: number;
  hours_leave_snapshot: {
    proration?: {
      periodWorkingDays: number;
      eligibleWorkingDays: number;
      unpaidLeaveDays: number;
    };
  } | null;
};

export type PayrollRunLineRow = {
  id: string;
  company_id: string;
  run_employee_id: string;
  component_type_id: string | null;
  kind: PayrollComponentKind;
  code: string;
  name: string;
  amount_minor: number;
  quantity_micro: number | null;
  rate_minor: number | null;
  percentage_bps: number | null;
  is_employer: boolean;
  is_variable: boolean;
  sort_order: number;
};

export type PayrollPayslipRow = {
  id: string;
  company_id: string;
  run_id: string;
  run_employee_id: string;
  employee_id: string;
  payslip_number: string;
  issued_at: string;
  payment_status: PayslipPaymentStatus;
  amount_paid_minor: number;
  snapshot: PayslipSnapshot;
  branding_name: string | null;
  footer_note: string | null;
  show_employer_costs: boolean;
};

export type PayrollRunsListPage = {
  available: boolean;
  runs: PayrollRunRow[];
  migrationMessage: string | null;
};

export type PayrollRunPage = {
  available: true;
  run: PayrollRunRow;
  schedule: PayrollPayScheduleRow | null;
  employees: {
    run_employee: PayrollRunEmployeeRow;
    employee: PayrollEmployeeRow;
    payslip: PayrollPayslipRow | null;
  }[];
  lines: PayrollRunLineRow[];
  payments: PayrollPaymentSummaryRow[];
  net_outstanding_minor: number;
};

export type PayrollPaymentSummaryRow = {
  id: string;
  payment_date: string;
  amount_minor: number;
  status: string;
  reference: string | null;
};

export type PayrollPayslipsListPage = {
  available: boolean;
  payslips: {
    payslip: PayrollPayslipRow;
    employee: PayrollEmployeeRow;
    run: PayrollRunRow;
  }[];
  migrationMessage: string | null;
};

export type PayrollPayslipPage = {
  available: true;
  payslip: PayrollPayslipRow;
  employee: PayrollEmployeeRow;
  run: PayrollRunRow;
};
