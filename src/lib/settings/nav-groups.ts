import { SETTINGS_CATEGORIES, type SettingsCategory } from "./categories";

/** Sidebar / mobile grouping — every category appears exactly once. */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  label: string;
  ids: readonly SettingsCategory[];
}> = [
  { label: "Start here", ids: ["overview", "features"] },
  {
    label: "Company & preferences",
    ids: ["organisation", "personal", "currencies", "documents"],
  },
  {
    label: "Books & compliance",
    ids: ["accounting", "tax", "reports", "audit", "import_migration"],
  },
  {
    label: "Sales, purchases & contacts",
    ids: ["sales", "purchases", "contacts", "portals"],
  },
  {
    label: "Banking & operations",
    ids: [
      "banking",
      "pos",
      "nonprofit",
      "dimensions",
      "products",
      "expenses",
      "fixed_assets",
      "payroll",
    ],
  },
  { label: "People & access", ids: ["users", "accountant"] },
  { label: "Automation & connections", ids: ["automation", "notifications", "integrations"] },
  { label: "Subscription & developer tools", ids: ["subscription", "demo"] },
] as const;

const groupedIds = new Set(SETTINGS_NAV_GROUPS.flatMap((g) => g.ids));

for (const id of SETTINGS_CATEGORIES) {
  if (!groupedIds.has(id)) {
    throw new Error(`Settings category "${id}" is missing from SETTINGS_NAV_GROUPS`);
  }
}
