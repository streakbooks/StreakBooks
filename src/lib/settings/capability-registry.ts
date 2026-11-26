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
    missingEvidence: ["field-level consumer tests"],
    note: "Organisation and legacy tax summary now save atomically with a before/after audit and stale-snapshot rejection; downstream field effects still need field-specific tests.",
  },
  {
    key: "accounting.workflow_safeguards",
    moduleId: "accounting",
    status: "partial",
    route: "/settings/accounting/overview",
    missingEvidence: [
      "workflow consumers and behavior tests for each warning and automation field",
    ],
    note: "Stored warning and auto-credit values are visible but read-only until the related transaction workflows enforce them.",
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
    missingEvidence: ["consumer tests for each field"],
    note: "Some bill defaults are wired; each policy needs a concrete transaction-effect test before being marked complete.",
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
    missingEvidence: ["account-wide preference scope and custom palette sync"],
    note: "Profile groups account details, security and appearance. Colour mode and named palettes sync per organisation; custom palette colours remain on this device.",
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
 * proven; the three capabilities above are the only complete controls.
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
  { moduleId: "pos", status: "missing", expected: "Register, locations, taxes and tenders" },
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
    expected: "Claims, limits, approvals and reimbursement",
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
