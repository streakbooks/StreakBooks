import type { SettingsCategory } from "./registry";

export type SettingsFieldPresentation = {
  label: string;
  description: string;
};

/**
 * Presentation-only copy for persisted organisation configuration.
 * The schemas, server permission checks and posting rules remain authoritative.
 */
const FIELDS: Record<string, SettingsFieldPresentation> = {
  "accounting.reporting_basis": {
    label: "Default accounting basis",
    description: "Choose the default reporting basis; this does not change posted journals.",
  },
  "accounting.warn_duplicate_document_numbers": {
    label: "Warn about duplicate document numbers",
    description: "Show a warning when a document number has already been used.",
  },
  "accounting.warn_post_to_control_account": {
    label: "Warn on control-account entries",
    description: "Flag direct entries to accounts controlled by receivables or payables.",
  },
  "accounting.warn_bank_direct_posting": {
    label: "Warn on direct bank postings",
    description: "Show a warning before direct posting to a bank ledger account.",
  },
  "accounting.warn_backdated_days": {
    label: "Backdated entry warning (days)",
    description: "Show a non-blocking journal warning at this age. Set to 0 to turn it off.",
  },
  "accounting.auto_apply_credits": {
    label: "Automatically apply available credits",
    description: "Default preference for using available credits against amounts due.",
  },
  "accounting.account_code_padding": {
    label: "Account code padding",
    description: "Minimum number of digits for formatted account codes (0–8).",
  },
  "sales.late_fees_enabled": {
    label: "Enable late-fee policy",
    description: "Turn on the late-fee preference for supported sales workflows.",
  },
  "sales.late_fee_type": {
    label: "Late-fee calculation",
    description: "Select a fixed amount or percentage.",
  },
  "sales.late_fee_amount": {
    label: "Late-fee amount or percentage",
    description: "Enter the amount or percentage used by the selected late-fee type.",
  },
  "sales.late_fee_grace_days": {
    label: "Late-fee grace period (days)",
    description: "Days after the due date before a late fee may apply.",
  },
  "sales.late_fee_compounding": {
    label: "Compound late fees",
    description: "Allow compounding where supported and legally permitted.",
  },
  "sales.reminders_enabled": {
    label: "Enable reminders",
    description: "Allow supported reminder workflows; delivery requires an email provider.",
  },
  "sales.reminder_days_before": {
    label: "Reminder days before due",
    description: "Enter comma-separated day offsets before the due date.",
  },
  "sales.reminder_days_after": {
    label: "Reminder days after due",
    description: "Enter comma-separated day offsets after the due date.",
  },
  "sales.allow_partial_payments": {
    label: "Allow partial payments",
    description: "Enable receiving part-payments against customer documents.",
  },
  "sales.write_off_threshold_minor": {
    label: "Write-off threshold (minor units)",
    description: "Use the smallest currency unit, such as cents or paise.",
  },
  "sales.retainers_enabled": {
    label: "Enable retainer workflow",
    description: "Make supported customer-retainer workflows available.",
  },
  "purchases.show_supplier_summary_default": {
    label: "Show supplier summary by default",
    description: "Display supplier details when opening purchase workflows.",
  },
  "purchases.bills_inbox_enabled": {
    label: "Enable bills inbox",
    description: "Enable the document inbox preference; email delivery requires setup.",
  },
  "purchases.approval_threshold_minor": {
    label: "Bill approval threshold (minor units)",
    description: "Leave blank for no threshold. Values use cents, pence or paise.",
  },
  "purchases.duplicate_detection": {
    label: "Check for duplicate bills",
    description: "Show supported duplicate-document checks during bill entry.",
  },
  "purchases.three_way_matching": {
    label: "Enable three-way matching",
    description: "Use purchase-order, receipt and bill matching where implemented.",
  },
  "purchases.contractor_1099_tracking": {
    label: "Track contractor 1099 details",
    description: "Enable contractor-tracking preferences for relevant US organisations.",
  },
  "banking.auto_apply_rules": {
    label: "Automatically apply banking rules",
    description: "Allow configured reconciliation rules to apply automatically.",
  },
  "banking.rule_confidence_threshold": {
    label: "Banking rule confidence (0–1)",
    description: "Set a confidence threshold between zero and one.",
  },
  "banking.reconciliation_tolerance_minor": {
    label: "Reconciliation tolerance (minor units)",
    description: "Maximum configured variance in the smallest currency unit.",
  },
  "banking.import_formats": {
    label: "Allowed statement import formats",
    description: "Enter the supported import types as a comma-separated list.",
  },
  "notifications.email_from_name": {
    label: "Email sender name",
    description: "Name shown on supported outgoing emails.",
  },
  "notifications.reply_to": {
    label: "Reply-to email",
    description: "Address that receives replies to outgoing messages.",
  },
  "notifications.quiet_hours_enabled": {
    label: "Enable quiet hours",
    description: "Apply configured quiet-hour preferences to supported notifications.",
  },
  "notifications.quiet_hours_start": {
    label: "Quiet hours start",
    description: "Use 24-hour time, for example 22:00.",
  },
  "notifications.quiet_hours_end": {
    label: "Quiet hours end",
    description: "Use 24-hour time, for example 07:00.",
  },
  "reports.default_basis": {
    label: "Default report basis",
    description: "Choose the accounting basis used when opening reports.",
  },
  "reports.default_comparison": {
    label: "Default report comparison",
    description: "Choose the initial comparison shown on supported reports.",
  },
  "products.track_inventory": {
    label: "Track inventory quantities",
    description: "Enable quantity tracking where inventory workflows are available.",
  },
  "products.allow_negative_stock": {
    label: "Allow negative stock",
    description: "Permit supported stock workflows to go below zero.",
  },
  "products.valuation_method": {
    label: "Inventory valuation method",
    description: "Choose the valuation approach for supported inventory workflows.",
  },
  "automation.ai_mode": {
    label: "AI assistant permission level",
    description:
      "Choose the permitted AI action level; approvals remain required where applicable.",
  },
  "automation.voice_commands": {
    label: "Enable voice commands",
    description: "Allow voice-command preferences on supported screens.",
  },
  "users.force_mfa_for_owners": {
    label: "Require MFA for owners",
    description: "Request multi-factor authentication for owner access.",
  },
  "users.session_idle_minutes": {
    label: "Idle session timeout (minutes)",
    description: "Number of idle minutes before supported session controls apply.",
  },
  "users.support_access_consent": {
    label: "Require support-access consent",
    description: "Require explicit consent before supported staff-support access.",
  },
};

export function settingsFieldPresentation(
  category: SettingsCategory,
  key: string,
): SettingsFieldPresentation {
  const explicit = FIELDS[`${category}.${key}`];
  if (explicit) return explicit;
  const readable = key.replaceAll("_", " ");
  return {
    label: readable.charAt(0).toUpperCase() + readable.slice(1),
    description: "Organisation-level preference.",
  };
}
