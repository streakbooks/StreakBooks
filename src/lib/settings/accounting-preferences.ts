import type { SettingsDocument } from "./settings-centre.functions";
import { validateSettingsDraft } from "./form-state";

export type AccountingPreferencesInput = {
  reportingBasis: "accrual" | "cash";
  warnDuplicateNumbers: boolean;
  warnControlAccounts: boolean;
  warnBankPosting: boolean;
  backdatedDays: string;
  autoApplyCredits: boolean;
};

/**
 * Preserve the full versioned accounting document, including fields edited
 * in the general Settings editor rather than the lock-policy workspace.
 */
export function prepareAccountingPreferences(
  baseline: SettingsDocument,
  input: AccountingPreferencesInput,
) {
  return validateSettingsDraft("accounting", {
    ...baseline,
    reporting_basis: input.reportingBasis,
    warn_duplicate_document_numbers: input.warnDuplicateNumbers,
    warn_post_to_control_account: input.warnControlAccounts,
    warn_bank_direct_posting: input.warnBankPosting,
    warn_backdated_days: input.backdatedDays,
    auto_apply_credits: input.autoApplyCredits,
  });
}

/** Preserve both Accounting drafts when either save action is still outstanding. */
export function hasUnsavedAccountingSettings(
  lockDraftDirty: boolean,
  preferencesDraftDirty: boolean,
): boolean {
  return lockDraftDirty || preferencesDraftDirty;
}

export type LockPolicyDraftInput = {
  everyone: string;
  advisers: string;
  conversion: string;
  requireOverrideReason: boolean;
  reason: string;
};

/** Preserve explicit false and normalize blank HTML date inputs to null. */
export function prepareLockPolicyPayload(companyId: string, draft: LockPolicyDraftInput) {
  return {
    companyId,
    lockDateEveryone: draft.everyone || null,
    lockDateExceptAdvisors: draft.advisers || null,
    conversionDate: draft.conversion || null,
    requireOverrideReason: draft.requireOverrideReason,
    reason: draft.reason,
  };
}
