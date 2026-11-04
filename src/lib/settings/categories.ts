/** Settings Centre category ids — information architecture. */
export const SETTINGS_CATEGORIES = [
  "overview",
  "features",
  "organisation",
  "accounting",
  "sales",
  "purchases",
  "banking",
  "dimensions",
  "tax",
  "products",
  "reports",
  "documents",
  "currencies",
  "contacts",
  "expenses",
  "automation",
  "users",
  "integrations",
  "audit",
  "accountant",
  "subscription",
  "demo",
  "notifications",
  "portals",
  "fixed_assets",
  "import_migration",
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

/** Fail closed for unsupported configuration categories before any database access. */
export function assertSettingsCategory(value: unknown): SettingsCategory {
  if (typeof value !== "string" || !SETTINGS_CATEGORIES.includes(value as SettingsCategory)) {
    throw new Error("Unknown settings category");
  }
  return value as SettingsCategory;
}
