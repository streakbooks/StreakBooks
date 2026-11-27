import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { CATEGORY_SCHEMAS, type SettingsCategory } from "@/lib/settings/registry";
import { settingsFieldPresentation } from "@/lib/settings/field-presentation";

export type SettingCapability = {
  key: string;
  label: string;
  moduleId: string;
  route: string;
  scope: "company" | "organisation" | "user" | "platform";
  defaultValue: string;
  validation: string;
  permission: string;
  entitlement: string | null;
  persistence: string;
  audit: string;
  consumer: string;
  test: string;
};

/**
 * Settings are listed here as complete only after every cross-layer contract
 * is evidenced. Incomplete controls stay in SETTINGS_GAPS and cannot be
 * mistaken for verified features by search, reports, or future UI generation.
 */
export const SETTING_CAPABILITY_REGISTRY: readonly SettingCapability[] = [
  {
    key: "documents.number_sequences",
    label: "Sales and purchase document number sequences",
    moduleId: "settings",
    route: "/settings",
    scope: "company",
    defaultValue: "Per-company sequences initialize when the first matching document is created",
    validation:
      "Settings server function validates sequence type, prefix, next number and padding; SQL RPC repeats range checks and forbids rewinds",
    permission: "company.settings.edit for changes; authenticated company member for allocation",
    entitlement: null,
    persistence: "document_sequences through compare-and-set save RPC and atomic number allocator",
    audit:
      "save_document_sequence_if_unchanged records before/after settings in the same database transaction",
    consumer:
      "Invoice, bill, quote and credit workflows allocate unique company-scoped numbers under row locks",
    test: "tests/integration/settings-legacy-cas.sql and src/lib/settings/document-numbering.test.ts",
  },
  {
    key: "company.base_currency",
    label: "Organisation base currency",
    moduleId: "settings",
    route: "/settings/organisation/overview",
    scope: "company",
    defaultValue: "Selected during organisation setup",
    validation:
      "Organisation identity RPC validates three-letter currency codes and rejects changes after posted journals",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "companies.base_currency through save_company_identity_and_tax",
    audit:
      "audit_events records exact before/after organisation identity values in the same transaction",
    consumer:
      "Journal posting and higher-level posting functions consume base currency under company-row share locks",
    test: "tests/integration/settings-company-identity-atomic.sql proves pre-posting update, journal currency consumption, posting locks and post-history rejection",
  },
  {
    key: "company.legal_name",
    label: "Organisation legal name",
    moduleId: "settings",
    route: "/settings/organisation/overview",
    scope: "company",
    defaultValue: "No separate legal name; organisation display name is used",
    validation: "Company identity server validator trims and bounds legal name to 200 characters",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "companies.legal_name through save_company_identity_and_tax",
    audit:
      "audit_events stores exact before/after organisation identity values in the same transaction",
    consumer:
      "Customer-facing document branding shows the saved legal name when it differs from the display name",
    test: "src/lib/documents/documents-loader.test.ts and tests/integration/settings-company-identity-atomic.sql",
  },
  {
    key: "company.timezone",
    label: "Organisation time zone",
    moduleId: "settings",
    route: "/settings/organisation/overview",
    scope: "company",
    defaultValue: "Selected during organisation setup; UTC is the migration fallback",
    validation:
      "Application validates IANA zones and a database trigger rejects unsupported zones for every company write",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "companies.timezone through the version-checked organisation identity RPC",
    audit:
      "audit_events stores the before/after identity values in the same transaction; invalid writes roll back",
    consumer:
      "Company-local business dates drive sales, document and notification scheduling helpers",
    test: "src/lib/company-validation.test.ts, src/lib/sales/dates.test.ts, src/lib/notifications/communication-rules.test.ts, and tests/integration/settings-company-identity-atomic.sql",
  },
  {
    key: "company.fiscal_year_end",
    label: "Organisation fiscal year end",
    moduleId: "settings",
    route: "/settings/organisation/overview",
    scope: "company",
    defaultValue: "31 December unless a different organisation year end is saved",
    validation:
      "Company identity validator and database RPC validate the month/day pair, including leap-year February boundaries",
    permission: "company.settings.edit",
    entitlement: null,
    persistence:
      "companies.fiscal_year_end_month and fiscal_year_end_day through save_company_identity_and_tax",
    audit:
      "audit_events stores exact before/after organisation identity values in the same transaction",
    consumer:
      "Accounting report, balance-sheet, year-end and period-close date ranges use the saved fiscal year end",
    test: "src/lib/accounting/ledger-data.test.ts, src/lib/accounting/fiscal-year.test.ts, and tests/integration/settings-company-identity-atomic.sql",
  },
  {
    key: "company.locale",
    label: "Organisation document locale",
    moduleId: "settings",
    route: "/settings/organisation/overview",
    scope: "company",
    defaultValue: "en-GB",
    validation: "The authenticated save function and database RPC allow only supported locales",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "companies.locale through save_company_localisation_if_unchanged",
    audit: "settings.localization stores exact before/after values in the same transaction",
    consumer:
      "Generated customer documents and emails format dates and currency using the saved locale",
    test: "src/lib/documents/documents-loader.test.ts, src/lib/documents/comms.test.ts, and tests/integration/settings-company-identity-atomic.sql",
  },
  {
    key: "company.date_format",
    label: "Organisation document date format",
    moduleId: "settings",
    route: "/settings/organisation/overview",
    scope: "company",
    defaultValue: "DD/MM/YYYY",
    validation:
      "The authenticated save function and database RPC allow only supported date formats",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "companies.date_format through save_company_localisation_if_unchanged",
    audit: "settings.localization stores exact before/after values in the same transaction",
    consumer:
      "Generated customer documents and emails use the saved date pattern while stored dates remain ISO",
    test: "src/lib/documents/documents-loader.test.ts, src/lib/documents/comms.test.ts, and tests/integration/settings-company-identity-atomic.sql",
  },
  {
    key: "accounting.lock_policy",
    label: "Accounting lock dates",
    moduleId: "accounting",
    route: "/settings/accounting/overview",
    scope: "company",
    defaultValue: "No lock dates; conversion date unset",
    validation: "Server date validation and compare-and-set version check",
    permission: "periods.lock",
    entitlement: null,
    persistence: "organisation_lock_policy via set_organisation_lock_policy_if_unchanged",
    audit: "settings_change_log records the reason and before/after policy",
    consumer: "assert_journal_date_unlocked guards journal posting",
    test: "tests/integration/settings-lock-policy-cas.sql",
  },
  {
    key: "accounting.warn_backdated_days",
    label: "Backdated entry warning threshold",
    moduleId: "accounting",
    route: "/settings/accounting/overview",
    scope: "company",
    defaultValue: "90 days; 0 disables the warning",
    validation: "accountingConfigSchema requires an integer from 0 to 3650",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.accounting through the version-checked settings RPC",
    audit: "settings_change_log records before/after category documents",
    consumer:
      "Manual journal entry shows a non-blocking warning when its date reaches the configured age; period locks remain authoritative",
    test: "src/lib/settings/backdated-journal-warning.test.ts",
  },
  {
    key: "accounting.reporting_basis",
    label: "Default reporting basis",
    moduleId: "reports",
    route: "/settings/reports/overview",
    scope: "company",
    defaultValue: "accrual",
    validation: "Zod enum accepts accrual or cash on server save",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.reporting document via guarded upsert RPC",
    audit: "settings_change_log stores prior and resulting configuration documents",
    consumer: "accounting-basis.server.ts selects basis for report APIs",
    test: "src/lib/reports/accounting-basis.test.ts and cash report function tests",
  },
  {
    key: "reports.default_comparison",
    label: "Default report comparison",
    moduleId: "reports",
    route: "/settings/reports/overview",
    scope: "company",
    defaultValue: "No comparison",
    validation: "Reports settings schema allowlists none, prior period or prior year",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.reports through the version-checked settings RPC",
    audit: "settings_change_log stores previous and resulting category documents",
    consumer:
      "Profit and loss and balance sheet reports use this comparison only when the URL and saved report settings have no explicit comparison",
    test: "src/lib/settings/report-defaults.test.ts proves defaults and explicit-choice precedence",
  },
  {
    key: "accounting.account_code_padding",
    label: "Account code display padding",
    moduleId: "accounting",
    route: "/settings/accounting/overview",
    scope: "company",
    defaultValue: "0 minimum digits",
    validation: "accountingConfigSchema validates an integer from 0 to 8 on the server",
    permission: "company.settings.edit; member-scoped reads",
    entitlement: null,
    persistence: "organisation_config.accounting via version-checked settings RPC",
    audit: "settings_change_log records before/after category documents",
    consumer:
      "ChartAccountsPanel formats numeric codes for display; stored codes and postings are unchanged",
    test: "src/lib/accounting/chart-view.test.ts covers configured padding and numeric/non-numeric codes",
  },
  {
    key: "accounting.manual_journal_memo",
    label: "Require memo on manual journals",
    moduleId: "accounting",
    route: "/settings/automation/overview",
    scope: "company",
    defaultValue: "false",
    validation: "Server normalizes the setting to a boolean and checks company.settings.edit",
    permission: "company.settings.edit for configuration; journals.manual for posting",
    entitlement: null,
    persistence: "company_workflow_settings.accounting_require_journal_memo",
    audit: "workflow settings trigger logs before/after values in the same transaction",
    consumer: "postManualJournal rejects an empty memo when the setting is enabled",
    test: "src/lib/accounting/manual-journal-settings.test.ts and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "tax.rate_code_master",
    label: "Tax rate and code master data",
    moduleId: "tax",
    route: "/tax",
    scope: "company",
    defaultValue: "No rates or tax codes until configured for the organisation",
    validation:
      "Server validates rate basis points, real effective dates, code format and linked account ownership",
    permission: "tax.settings",
    entitlement: null,
    persistence: "Tenant-scoped tax_rates and tax_codes tables with existing RLS",
    audit:
      "Tax master triggers append before/after rows to settings_change_log in the same transaction",
    consumer:
      "Effective tax rates and codes drive sales/purchase tax selection; captured rate basis points feed document posting and tax returns",
    test: "tests/integration/tax-master-settings-audit.sql, tests/integration/tax-master-posted-history.sql, and tax math/report consumer tests",
  },
  {
    key: "sales.default_payment_terms",
    label: "Default sales invoice payment terms",
    moduleId: "sales",
    route: "/settings/sales/overview",
    scope: "company",
    defaultValue: "30 days",
    validation: "Server validates an integer from 0 to 3650 days",
    permission:
      "company.settings.edit for configuration; customer-specific terms still take precedence",
    entitlement: null,
    persistence: "company_workflow_settings.sales_default_payment_terms_days",
    audit: "workflow settings trigger records before/after typed values in settings_change_log",
    consumer: "Sales document editor uses this term to calculate new invoice due dates",
    test: "src/lib/sales/document-defaults.test.ts, src/lib/settings/workflow-settings.functions.test.ts, and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "sales.default_notes",
    label: "Default sales document notes",
    moduleId: "sales",
    route: "/settings/sales/overview",
    scope: "company",
    defaultValue: "No notes",
    validation: "Server validates and bounds text input before persistence",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "company_workflow_settings.sales_default_notes",
    audit: "workflow settings trigger redacts free-text before/after values in settings_change_log",
    consumer:
      "Sales document editor applies notes to new invoices and quotes; credit notes are excluded",
    test: "src/lib/sales/document-defaults.test.ts, src/lib/settings/workflow-settings.functions.test.ts, and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "sales.payment_instructions",
    label: "Default sales payment instructions",
    moduleId: "sales",
    route: "/settings/sales/overview",
    scope: "company",
    defaultValue: "No instructions",
    validation: "Server validates and bounds text input before persistence",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "company_workflow_settings.sales_payment_instructions",
    audit: "workflow settings trigger redacts free-text before/after values in settings_change_log",
    consumer:
      "Sales invoice, quote and receipt printing uses this text when document branding has no explicit payment instructions",
    test: "src/lib/documents/sales-document-defaults.test.ts, src/lib/settings/workflow-settings.functions.test.ts, and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "sales.payment_reminders",
    label: "Payment reminder schedule",
    moduleId: "sales",
    route: "/settings/sales/reminders",
    scope: "company",
    defaultValue: "First reminder after 7 days; repeat every 14 days; maximum 3",
    validation:
      "Server normalizes first delay, repeat interval, maximum count and bank-detail flag",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "company_reminder_settings",
    audit: "Same-transaction typed before/after values in settings_change_log",
    consumer:
      "Invoice reminders use the configured due-date schedule, stop at the configured maximum and include bank details only when enabled; delivery remains manual",
    test: "src/lib/documents/comms.test.ts, tests/integration/reminder-settings-audit.sql and manual reminder send regression",
  },
  {
    key: "sales.quote_validity",
    label: "Default quote validity",
    moduleId: "sales",
    route: "/settings/sales/overview",
    scope: "company",
    defaultValue: "30 days",
    validation: "Server validates an integer from 1 to 365 days",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "company_workflow_settings.sales_quote_validity_days",
    audit: "workflow settings trigger records before/after typed values in settings_change_log",
    consumer: "Sales document editor uses this validity to calculate quote expiry dates",
    test: "src/lib/sales/document-defaults.test.ts, src/lib/settings/workflow-settings.functions.test.ts, and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "purchases.show_supplier_summary_default",
    label: "Show supplier summary by default",
    moduleId: "purchases",
    route: "/settings/purchases/overview",
    scope: "company",
    defaultValue: "Show the summary when a user has no saved bill workspace preference",
    validation:
      "Purchases settings schema requires a boolean; malformed stored data keeps the existing open default",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.purchases through the version-checked settings RPC",
    audit: "settings_change_log stores previous and resulting category documents",
    consumer:
      "New bill workspaces use this organisation default until a user saves their own sidebar preference",
    test: "src/lib/settings/ui-preferences.functions.test.ts proves default application and saved user preference precedence",
  },
  {
    key: "purchases.require_po",
    label: "Prefer purchase orders before bills",
    moduleId: "purchases",
    route: "/settings/purchases/overview",
    scope: "company",
    defaultValue: "false",
    validation: "Server parses the submitted value as a boolean before updating workflow settings",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "company_workflow_settings.purchases_require_po, updated only when submitted",
    audit: "Same-transaction workflow settings trigger records this boolean in settings_change_log",
    consumer:
      "New bill workspace displays a clear purchase-order preference notice when enabled; independent bills remain allowed by design",
    test: "src/lib/purchases/purchase-order-preference.test.ts, src/lib/settings/workflow-settings.functions.test.ts and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "purchases.three_way_matching",
    label: "Require three-way matching for purchase-order bills",
    moduleId: "purchases",
    route: "/settings/purchases/overview",
    scope: "company",
    defaultValue: "disabled",
    validation:
      "Purchases settings use shared schema validation; malformed saved data blocks bill authorisation",
    permission:
      "company.settings.edit to change the setting; purchases.view to inspect match results; bill authorisation stays server-side",
    entitlement: null,
    persistence: "organisation_config.purchases through the version-checked settings RPC",
    audit: "settings_change_log stores previous and resulting category documents",
    consumer:
      "Purchase-order bill authorisation requires an order, receipt and bill match when enabled; invalid configuration and unavailable required receipt data fail closed",
    test: "src/lib/purchases/po-three-way-match.load.test.ts and src/lib/purchases/po-three-way-match.test.ts",
  },
  {
    key: "purchases.default_payment_terms",
    label: "Default purchase bill payment terms",
    moduleId: "purchases",
    route: "/settings/purchases/overview",
    scope: "company",
    defaultValue: "30 days",
    validation: "Server validates an integer from 0 to 3650 days",
    permission:
      "company.settings.edit for configuration; supplier-specific terms still take precedence",
    entitlement: null,
    persistence: "company_workflow_settings.purchases_default_payment_terms_days",
    audit: "workflow settings trigger records before/after typed values in settings_change_log",
    consumer: "Purchase bill editor uses this term to calculate new bill due dates",
    test: "src/lib/purchases/bill-form-helpers.test.ts, src/lib/settings/workflow-settings.functions.test.ts, and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "purchases.default_notes",
    label: "Default purchase bill notes",
    moduleId: "purchases",
    route: "/settings/purchases/overview",
    scope: "company",
    defaultValue: "No notes",
    validation: "Server validates and bounds text input before persistence",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "company_workflow_settings.purchases_default_notes",
    audit: "workflow settings trigger redacts free-text before/after values in settings_change_log",
    consumer: "Purchase bill editor applies saved notes to new bills and resets",
    test: "src/lib/purchases/bill-form-helpers.test.ts, src/lib/settings/workflow-settings.functions.test.ts, and tests/integration/workflow-settings-audit.sql",
  },
  {
    key: "notifications.email_from_name",
    label: "Outgoing email sender name",
    moduleId: "settings",
    route: "/settings/notifications/overview",
    scope: "company",
    defaultValue: "Use the verified server sender name",
    validation:
      "notificationsConfigSchema rejects line breaks, angle brackets and names over 120 characters",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.notifications through the version-checked settings RPC",
    audit: "settings_change_log records before/after notification category documents",
    consumer:
      "Document, test and digest email paths add this display name to the server-verified sender address",
    test: "src/lib/notifications/communication-settings.server.test.ts and document email consumer tests",
  },
  {
    key: "notifications.reply_to",
    label: "Outgoing email reply-to address",
    moduleId: "settings",
    route: "/settings/notifications/overview",
    scope: "company",
    defaultValue: "No reply-to override",
    validation: "notificationsConfigSchema requires an email address or an empty value",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.notifications through the version-checked settings RPC",
    audit: "settings_change_log records before/after notification category documents",
    consumer: "Document, test and digest email paths set replyTo only when configured",
    test: "src/lib/notifications/communication-settings.server.test.ts and communications function tests",
  },
  {
    key: "notifications.quiet_hours_enabled",
    label: "Organisation digest quiet hours",
    moduleId: "settings",
    route: "/settings/notifications/overview",
    scope: "company",
    defaultValue: "disabled",
    validation: "notificationsConfigSchema requires a boolean and valid start/end times",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.notifications through the version-checked settings RPC",
    audit: "settings_change_log records before/after notification category documents",
    consumer:
      "Manual and scheduled digest delivery is paused during organisation quiet hours; financial document sends remain available",
    test: "src/lib/notifications/digest-schedule.test.ts and communications function tests",
  },
  {
    key: "notifications.quiet_hours_start",
    label: "Organisation quiet-hours start",
    moduleId: "settings",
    route: "/settings/notifications/overview",
    scope: "company",
    defaultValue: "22:00 in the organisation timezone",
    validation: "notificationsConfigSchema accepts only 24-hour HH:MM values",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.notifications through the version-checked settings RPC",
    audit: "settings_change_log records before/after notification category documents",
    consumer: "Digest delivery uses the saved start boundary with the organisation timezone",
    test: "src/lib/notifications/communication-rules.test.ts and digest-schedule.test.ts",
  },
  {
    key: "notifications.quiet_hours_end",
    label: "Organisation quiet-hours end",
    moduleId: "settings",
    route: "/settings/notifications/overview",
    scope: "company",
    defaultValue: "07:00 in the organisation timezone",
    validation: "notificationsConfigSchema accepts only 24-hour HH:MM values",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_config.notifications through the version-checked settings RPC",
    audit: "settings_change_log records before/after notification category documents",
    consumer: "Digest delivery uses the saved end boundary with the organisation timezone",
    test: "src/lib/notifications/communication-rules.test.ts and digest-schedule.test.ts",
  },
  {
    key: "features.classes",
    label: "Classes feature",
    moduleId: "accounting",
    route: "/settings/features/overview",
    scope: "company",
    defaultValue: "disabled",
    validation: "Feature key is allowlisted and dependency/disable rules run server-side",
    permission: "company.settings.edit",
    entitlement: null,
    persistence: "organisation_features via set_organisation_feature RPC",
    audit: "settings_change_log captures enabled state and reason",
    consumer: "Sales and Purchases document forms expose class allocation only when enabled",
    test: "tests/integration/settings-feature-disable-guard.sql",
  },
] as const;

export type SettingGap = {
  key: string;
  moduleId: string;
  status: "partial" | "placeholder" | "missing" | "blocked";
  route: string | null;
  missingEvidence: readonly string[];
  note: string;
};

/** Known settings still needing one or more proof points before promotion. */
export const SETTINGS_GAPS: readonly SettingGap[] = [
  {
    key: "company.identity_and_locale",
    moduleId: "settings",
    status: "partial",
    route: "/settings/organisation/overview",
    missingEvidence: ["field-level consumers for country and legacy tax summary"],
    note: "Base currency, legal name, fiscal year end, time zone, document locale and document date format have field-level evidence; country and legacy tax-summary fields remain partial.",
  },
  {
    key: "accounting.workflow_safeguards",
    moduleId: "accounting",
    status: "partial",
    route: "/settings/accounting/overview",
    missingEvidence: [
      "workflow consumers and behavior tests for duplicate, control-account and bank-posting warnings plus auto-credit",
    ],
    note: "Manual-journal memo enforcement and the backdate warning have tested consumers; duplicate, control-account and bank-posting warnings plus auto-credit remain read-only until their workflows enforce them.",
  },
  {
    key: "tax.regional_configuration",
    moduleId: "tax",
    status: "partial",
    route: "/settings/tax/overview",
    missingEvidence: [
      "authoritative tax-regime and tax-code ownership",
      "effective-date, jurisdiction and reporting-consumer behavior tests",
    ],
    note: "Tax controls remain in the Tax module; do not add duplicate organisation-level rate or regime fields until their transaction and reporting effects are proven.",
  },
  {
    key: "sales.typed_configuration",
    moduleId: "sales",
    status: "partial",
    route: "/settings/sales/overview",
    missingEvidence: [
      "consumer tests for each field",
      "disabled controls for non-operative values",
    ],
    note: "The typed editor persists configuration, but late fees and reminder delivery have unavailable worker/provider paths.",
  },
  {
    key: "purchases.typed_configuration",
    moduleId: "purchases",
    status: "partial",
    route: "/settings/purchases/overview",
    missingEvidence: [
      "consumer tests for bill inbox, approval threshold, duplicate detection and contractor tracking",
    ],
    note: "Supplier summary, bill terms, bill notes, purchase-order preference and three-way-match authorization have field-level consumers; unsupported purchase policies stay read-only.",
  },
  {
    key: "expense-management.typed_configuration",
    moduleId: "expense-management",
    status: "partial",
    route: "/expense-management/settings",
    missingEvidence: [
      "integration evidence that the configured employee payable account reaches the actual reimbursement journal",
    ],
    note: "Expense setting inserts and updates now record exact field-level before/after values in the same transaction; audit failure rolls back the change. Saved distance units initialize new mileage-rate forms; default claim currency initializes eligible drafts; spending controls and self-approval have guards. Expense settings remain partial until an integration test proves the configured employee payable account reaches the actual reimbursement journal.",
  },
  {
    key: "payroll.settings_audit_coverage",
    moduleId: "payroll",
    status: "partial",
    route: "/payroll/settings",
    missingEvidence: [
      "field-level before/after audit evidence for payroll calculation, approval, and payment settings",
    ],
    note: "Payroll settings are permission-checked and their calculation policy feeds run previews and calculations. The existing audit event is only a summary, so settings remain partial until sensitive field-level changes have safe, same-transaction audit evidence.",
  },
  {
    key: "banking.typed_configuration",
    moduleId: "banking",
    status: "partial",
    route: "/settings/banking/overview",
    missingEvidence: ["consumer tests for every typed field"],
    note: "Rule, feed and import workspaces have their own configuration owners; central typed values are not all proven to drive them.",
  },
  {
    key: "users.security_preferences",
    moduleId: "settings",
    status: "partial",
    route: "/settings/users/overview",
    missingEvidence: ["enforcement proof for MFA and idle timeout"],
    note: "Preferences must not be described as enforcement until auth/session behavior consumes them.",
  },
  {
    key: "integrations.provider_connections",
    moduleId: "app-store",
    status: "partial",
    route: "/settings/integrations/overview",
    missingEvidence: ["verified provider connection and delivery evidence per provider"],
    note: "A configured status badge alone does not prove provider delivery.",
  },
  {
    key: "personal.profile_preferences",
    moduleId: "profile",
    status: "partial",
    route: "/settings/personal/overview",
    missingEvidence: ["account-wide preference scope"],
    note: "Profile groups account details, security and appearance. Colour mode plus named and validated custom palettes sync per user within each organisation; preferences are not account-global.",
  },
] as const;

export type SettingFieldCoverage = {
  key: string;
  label: string;
  category: SettingsCategory;
  moduleId: string;
  route: string;
  scope: "company";
  validation: string;
  persistence: string;
  audit: string;
  consumer: string;
  status: "complete" | "partial";
  missingEvidence: readonly string[];
};

const completeKeys = new Set(SETTING_CAPABILITY_REGISTRY.map((setting) => setting.key));

/**
 * Per-field coverage for every persisted typed setting. This intentionally
 * marks fields partial until their consumer effects and field-level tests are
 * proven; capabilities above are complete only when their cross-layer contracts are evidenced.
 */
export const SETTING_FIELD_COVERAGE: readonly SettingFieldCoverage[] = Object.entries(
  CATEGORY_SCHEMAS,
).flatMap(([category, schema]) =>
  Object.entries(schema.shape).map(([field, fieldSchema]) => {
    const key = `${category}.${field}`;
    const complete = completeKeys.has(key);
    const label = settingsFieldPresentation(category as SettingsCategory, field).label;
    return {
      key,
      label,
      category: category as SettingsCategory,
      moduleId: category === "reports" ? "reports" : category,
      route: `/settings/${category}/overview`,
      scope: "company" as const,
      validation: `Zod schema in src/lib/settings/registry.ts (${fieldSchema.constructor.name})`,
      persistence: `organisation_config.${category} through version-checked settings RPC`,
      audit: "settings_change_log stores previous and resulting category documents",
      consumer: complete
        ? SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === key)!.consumer
        : "No field-specific consumer is yet proven by an effect test",
      status: complete ? ("complete" as const) : ("partial" as const),
      missingEvidence: complete
        ? []
        : ["field-level consumer behavior", "permission and consumer integration test"],
    };
  }),
);

export type ModuleSettingsCoverage = {
  moduleId: string;
  status: "implemented" | "partial" | "missing" | "not_applicable";
  expected: string;
};

/** Explicitly tracks every real registered module, including modules with no configuration UI. */
export const MODULE_SETTINGS_COVERAGE: readonly ModuleSettingsCoverage[] = [
  { moduleId: "dashboard", status: "partial", expected: "Dashboard and display preferences" },
  { moduleId: "banking", status: "partial", expected: "Feeds, rules, imports and reconciliation" },
  {
    moduleId: "pos",
    status: "partial",
    expected: "Register setup and location access exist; tax and tender controls remain missing",
  },
  {
    moduleId: "sales",
    status: "partial",
    expected: "Invoice, quote, reminders and payment defaults",
  },
  {
    moduleId: "purchases",
    status: "partial",
    expected: "Bills, suppliers, purchase orders and approvals",
  },
  {
    moduleId: "expense-management",
    status: "partial",
    expected: "Claims, limits, approvals, reimbursement and mileage defaults",
  },
  { moduleId: "crm", status: "partial", expected: "Pipelines, territories and CRM defaults" },
  {
    moduleId: "property-management",
    status: "partial",
    expected: "Property, owner, agreement and settlement policies",
  },
  { moduleId: "hr", status: "partial", expected: "Organisation, leave and workforce policy" },
  {
    moduleId: "contacts",
    status: "partial",
    expected: "Contact numbering, terms, groups and tags",
  },
  {
    moduleId: "products-services",
    status: "partial",
    expected: "Items, stock, valuation and price defaults",
  },
  {
    moduleId: "files",
    status: "partial",
    expected: "Document retention, access and upload policy",
  },
  {
    moduleId: "accounting",
    status: "partial",
    expected: "Periods, close policy, journals and dimensions",
  },
  { moduleId: "budgets", status: "partial", expected: "Budget periods, dimensions and alerts" },
  { moduleId: "projects", status: "partial", expected: "Project, time and allocation defaults" },
  {
    moduleId: "fixed-assets",
    status: "partial",
    expected: "Asset classes, depreciation and disposal defaults",
  },
  {
    moduleId: "payroll",
    status: "partial",
    expected: "Payroll schedules, accounts and components",
  },
  {
    moduleId: "reports",
    status: "partial",
    expected: "Basis, comparison, report views and schedules",
  },
  { moduleId: "tax", status: "partial", expected: "Regime, codes, rates and region support" },
  {
    moduleId: "advisors-marketplace",
    status: "partial",
    expected: "Client-facing advisor discovery and checkout",
  },
  {
    moduleId: "accountant",
    status: "partial",
    expected: "Accountant workflow defaults and review access",
  },
  {
    moduleId: "firm",
    status: "partial",
    expected: "Client grants, staff roles, seats and firm billing",
  },
  {
    moduleId: "advisors-admin",
    status: "partial",
    expected: "Service catalogue, delivery and advisor access",
  },
  {
    moduleId: "advisors-portal",
    status: "partial",
    expected: "Client portal preferences and notifications",
  },
  {
    moduleId: "action-center",
    status: "partial",
    expected: "Alert preferences and workflow routing",
  },
  { moduleId: "app-store", status: "partial", expected: "Marketplace app and connection settings" },
  {
    moduleId: "developer",
    status: "partial",
    expected: "API keys, OAuth applications and webhooks",
  },
  { moduleId: "messages", status: "partial", expected: "Messaging and notification policy" },
  {
    moduleId: "ai-assistant",
    status: "partial",
    expected: "AI access, spend and confirmation policy",
  },
  {
    moduleId: "settings",
    status: "implemented",
    expected: "Tenant configuration and preference navigation",
  },
  { moduleId: "help", status: "not_applicable", expected: "No organisation configuration surface" },
  {
    moduleId: "platform",
    status: "partial",
    expected: "Platform-owner settings, separate from tenant scope",
  },
  { moduleId: "profile", status: "partial", expected: "Personal profile and user preferences" },
  {
    moduleId: "onboarding",
    status: "partial",
    expected: "Initial organisation setup and safe defaults",
  },
  {
    moduleId: "auth",
    status: "not_applicable",
    expected: "Authentication screens; auth policy is owned by server configuration",
  },
] as const;

export function settingsCoverageForModule(moduleId: string) {
  return MODULE_SETTINGS_COVERAGE.find((item) => item.moduleId === moduleId);
}

export function validateSettingsCapabilityRegistry(): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const setting of SETTING_CAPABILITY_REGISTRY) {
    if (keys.has(setting.key)) problems.push(`Duplicate setting key: ${setting.key}`);
    keys.add(setting.key);
    for (const evidence of [
      setting.route,
      setting.defaultValue,
      setting.validation,
      setting.permission,
      setting.persistence,
      setting.audit,
      setting.consumer,
      setting.test,
    ]) {
      if (!evidence.trim()) problems.push(`${setting.key} is missing required evidence`);
    }
    if (!MODULE_REGISTRY.some((module) => module.id === setting.moduleId)) {
      problems.push(`${setting.key} references unknown module ${setting.moduleId}`);
    }
  }
  const covered = new Set(MODULE_SETTINGS_COVERAGE.map((item) => item.moduleId));
  for (const module of MODULE_REGISTRY) {
    if (!covered.has(module.id))
      problems.push(`Module has no settings coverage record: ${module.id}`);
  }
  for (const moduleId of covered) {
    if (!MODULE_REGISTRY.some((module) => module.id === moduleId)) {
      problems.push(`Settings coverage references unknown module: ${moduleId}`);
    }
  }
  const fields = new Set<string>();
  for (const setting of SETTING_FIELD_COVERAGE) {
    if (fields.has(setting.key)) problems.push(`Duplicate setting field coverage: ${setting.key}`);
    fields.add(setting.key);
    if (!setting.route || !setting.validation || !setting.persistence || !setting.audit) {
      problems.push(`${setting.key} is missing ownership or persistence evidence`);
    }
  }
  for (const [category, schema] of Object.entries(CATEGORY_SCHEMAS)) {
    for (const field of Object.keys(schema.shape)) {
      if (!fields.has(`${category}.${field}`)) {
        problems.push(`Typed setting has no field coverage record: ${category}.${field}`);
      }
    }
  }
  return problems;
}
