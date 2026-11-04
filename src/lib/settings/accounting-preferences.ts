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
