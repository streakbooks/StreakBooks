import { SETTINGS_CATEGORIES, type SettingsCategory } from "./categories";

/** Sidebar / mobile grouping — every category appears exactly once. */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  label: string;
  ids: readonly SettingsCategory[];
}> = [
  { label: "Start", ids: ["overview", "features"] },
  {
    label: "Organisation",
    ids: ["organisation", "accounting", "currencies", "tax", "documents"],
  },
  {
    label: "Operations",
    ids: [
      "sales",
      "purchases",
      "banking",
      "dimensions",
      "products",
      "contacts",
      "expenses",
      "reports",
    ],
  },
  {
    label: "Platform",
    ids: [
      "users",
      "automation",
      "integrations",
      "notifications",
      "audit",
      "import_migration",
      "portals",
      "fixed_assets",
      "payroll",
    ],
  },
  { label: "Firm & plan", ids: ["accountant", "subscription", "demo"] },
] as const;

const groupedIds = new Set(SETTINGS_NAV_GROUPS.flatMap((g) => g.ids));

for (const id of SETTINGS_CATEGORIES) {
  if (!groupedIds.has(id)) {
    throw new Error(`Settings category "${id}" is missing from SETTINGS_NAV_GROUPS`);
  }
}