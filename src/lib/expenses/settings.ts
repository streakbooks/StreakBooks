import type {
  ExpenseDistanceUnit,
  ExpenseManagementSettings,
  ExpenseManagementSettingsInput,
} from "./types";

type SettingsRow = {
  company_id?: string;
  companyId?: string;
  enabled?: boolean;
  claim_number_prefix?: string;
  claimNumberPrefix?: string;
  default_claim_currency?: string | null;
  defaultClaimCurrency?: string | null;
  employee_payable_account_id?: string | null;
  employeePayableAccountId?: string | null;
  employee_advance_account_id?: string | null;
  employeeAdvanceAccountId?: string | null;
  petty_cash_account_id?: string | null;
  pettyCashAccountId?: string | null;
  fx_gain_account_id?: string | null;
  fxGainAccountId?: string | null;
  fx_loss_account_id?: string | null;
  fxLossAccountId?: string | null;
  require_receipt_above_minor?: number;
  requireReceiptAboveMinor?: number;
  allow_multi_currency_claims?: boolean;
  allowMultiCurrencyClaims?: boolean;
  prevent_self_approval?: boolean;
  preventSelfApproval?: boolean;
  default_distance_unit?: string;
  defaultDistanceUnit?: string;
  version?: number;
  exists?: boolean;
  updated_at?: string | null;
  updatedAt?: string | null;
};

function asDistanceUnit(value: string | undefined | null): ExpenseDistanceUnit {
  return value === "mi" ? "mi" : "km";
}

export function mapExpenseManagementSettings(
  row: SettingsRow | null | undefined,
  companyId: string,
): ExpenseManagementSettings {
  if (!row) {
    return {
      companyId,
      enabled: false,
      claimNumberPrefix: "EXP-",
      defaultClaimCurrency: null,
      employeePayableAccountId: null,
      employeeAdvanceAccountId: null,
      pettyCashAccountId: null,
      fxGainAccountId: null,
      fxLossAccountId: null,
      requireReceiptAboveMinor: 0,
      allowMultiCurrencyClaims: true,
      preventSelfApproval: true,
      defaultDistanceUnit: "km",
      version: 0,
      exists: false,
      updatedAt: null,
    };
  }

  return {
    companyId: String(row.company_id ?? row.companyId ?? companyId),
    enabled: Boolean(row.enabled),
    claimNumberPrefix: String(row.claim_number_prefix ?? row.claimNumberPrefix ?? "EXP-"),
    defaultClaimCurrency: (row.default_claim_currency ?? row.defaultClaimCurrency ?? null) as
      | string
      | null,
    employeePayableAccountId: (row.employee_payable_account_id ??
      row.employeePayableAccountId ??
      null) as string | null,
    employeeAdvanceAccountId: (row.employee_advance_account_id ??
      row.employeeAdvanceAccountId ??
      null) as string | null,
    pettyCashAccountId: (row.petty_cash_account_id ?? row.pettyCashAccountId ?? null) as
      | string
      | null,
    fxGainAccountId: (row.fx_gain_account_id ?? row.fxGainAccountId ?? null) as string | null,
    fxLossAccountId: (row.fx_loss_account_id ?? row.fxLossAccountId ?? null) as string | null,
    requireReceiptAboveMinor: Number(
      row.require_receipt_above_minor ?? row.requireReceiptAboveMinor ?? 0,
    ),
    allowMultiCurrencyClaims: Boolean(
      row.allow_multi_currency_claims ?? row.allowMultiCurrencyClaims ?? true,
    ),
    preventSelfApproval: Boolean(
      row.prevent_self_approval ?? row.preventSelfApproval ?? true,
    ),
    defaultDistanceUnit: asDistanceUnit(
      row.default_distance_unit ?? row.defaultDistanceUnit ?? "km",
    ),
    version: Number(row.version ?? 0),
    exists: row.exists !== false && Number(row.version ?? 0) > 0,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function toExpenseManagementSettingsPayload(
  input: ExpenseManagementSettingsInput,
): Record<string, unknown> {
  return {
    version: input.version,
    enabled: input.enabled,
    claim_number_prefix: input.claimNumberPrefix,
    default_claim_currency: input.defaultClaimCurrency,
    employee_payable_account_id: input.employeePayableAccountId,
    employee_advance_account_id: input.employeeAdvanceAccountId,
    petty_cash_account_id: input.pettyCashAccountId,
    fx_gain_account_id: input.fxGainAccountId,
    fx_loss_account_id: input.fxLossAccountId,
    require_receipt_above_minor: input.requireReceiptAboveMinor,
    allow_multi_currency_claims: input.allowMultiCurrencyClaims,
    prevent_self_approval: input.preventSelfApproval,
    default_distance_unit: input.defaultDistanceUnit,
  };
}
