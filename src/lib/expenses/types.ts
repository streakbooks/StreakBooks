/** Domain types for Expense Management (EM-01 foundation). */

export const EXPENSE_APPROVAL_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "returned",
  "rejected",
  "withdrawn",
  "voided",
] as const;

export type ExpenseApprovalStatus = (typeof EXPENSE_APPROVAL_STATUSES)[number];

export const EXPENSE_POSTING_STATUSES = [
  "not_posted",
  "ready",
  "posting",
  "posted",
  "failed",
  "reversed",
] as const;

export type ExpensePostingStatus = (typeof EXPENSE_POSTING_STATUSES)[number];

export const EXPENSE_REIMBURSEMENT_STATUSES = [
  "not_eligible",
  "eligible",
  "awaiting_payment",
  "payment_initiated",
  "partially_paid",
  "paid",
  "payment_failed",
  "refunded",
] as const;

export type ExpenseReimbursementStatus = (typeof EXPENSE_REIMBURSEMENT_STATUSES)[number];

export const EXPENSE_PAYMENT_SOURCES = [
  "employee_paid",
  "corporate_card",
  "cash_advance",
  "company_paid",
] as const;

export type ExpensePaymentSource = (typeof EXPENSE_PAYMENT_SOURCES)[number];

export const EXPENSE_DISTANCE_UNITS = ["km", "mi"] as const;
export type ExpenseDistanceUnit = (typeof EXPENSE_DISTANCE_UNITS)[number];

export type ExpenseManagementSettings = {
  companyId: string;
  enabled: boolean;
  claimNumberPrefix: string;
  defaultClaimCurrency: string | null;
  employeePayableAccountId: string | null;
  employeeAdvanceAccountId: string | null;
  pettyCashAccountId: string | null;
  fxGainAccountId: string | null;
  fxLossAccountId: string | null;
  requireReceiptAboveMinor: number;
  requireSpendingRequestAboveMinor: number;
  allowMultiCurrencyClaims: boolean;
  preventSelfApproval: boolean;
  defaultDistanceUnit: ExpenseDistanceUnit;
  version: number;
  exists: boolean;
  updatedAt?: string | null;
};

export type ExpenseManagementSettingsInput = {
  version: number;
  enabled?: boolean;
  claimNumberPrefix?: string;
  defaultClaimCurrency?: string | null;
  employeePayableAccountId?: string | null;
  employeeAdvanceAccountId?: string | null;
  pettyCashAccountId?: string | null;
  fxGainAccountId?: string | null;
  fxLossAccountId?: string | null;
  requireSpendingRequestAboveMinor?: number;
  requireReceiptAboveMinor?: number;
  allowMultiCurrencyClaims?: boolean;
  preventSelfApproval?: boolean;
  defaultDistanceUnit?: ExpenseDistanceUnit;
};
