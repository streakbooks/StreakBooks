import { SETTINGS_CATEGORIES, type SettingsCategory } from "./categories";
import type { SettingsPanelId } from "./panels";

export type SettingsRoute = {
  group: SettingsCategory;
  page: string;
  section: SettingsCategory;
  panel?: SettingsPanelId;
  pageLabel: string;
};

const detailRoutes: Record<string, Omit<SettingsRoute, "group" | "page">> = {
  "organisation/branding": {
    section: "organisation",
    panel: "branding",
    pageLabel: "Branding",
  },
  "documents/branding": { section: "documents", panel: "branding", pageLabel: "Branding" },
  "documents/numbering": { section: "documents", panel: "numbering", pageLabel: "Numbering" },
  "contacts/customers": {
    section: "contacts",
    panel: "customer-defaults",
    pageLabel: "Customer defaults",
  },
  "contacts/suppliers": {
    section: "contacts",
    panel: "supplier-defaults",
    pageLabel: "Supplier defaults",
  },
  "contacts/general": {
    section: "contacts",
    panel: "contact-settings",
    pageLabel: "Contact settings",
  },
  "sales/defaults": { section: "sales", panel: "sales-defaults", pageLabel: "Sales defaults" },
  "sales/reminders": { section: "sales", panel: "reminders", pageLabel: "Invoice reminders" },
  "purchases/defaults": {
    section: "purchases",
    panel: "purchases-defaults",
    pageLabel: "Purchase defaults",
  },
  "banking/rules": { section: "banking", panel: "bank-rules", pageLabel: "Bank rules" },
  "banking/feeds": { section: "banking", panel: "bank-feeds", pageLabel: "Bank feeds" },
  "banking/import": { section: "banking", panel: "bank-import", pageLabel: "Statement import" },
  "portals/access": { section: "portals", panel: "portals", pageLabel: "Portal access" },
};

const overviewRoutes = new Set<SettingsCategory>(SETTINGS_CATEGORIES);

export function resolveSettingsRoute(group: string, page: string): SettingsRoute | undefined {
  if (!SETTINGS_CATEGORIES.includes(group as SettingsCategory)) return undefined;
  const sectionGroup = group as SettingsCategory;
  if (page === "overview" && overviewRoutes.has(sectionGroup)) {
    return { group: sectionGroup, page, section: sectionGroup, pageLabel: "Overview" };
  }
  const detail = detailRoutes[`${group}/${page}`];
  return detail ? { group: sectionGroup, page, ...detail } : undefined;
}

const legacyPaths: Record<string, { group: SettingsCategory; page: string }> = {
  "/documents/branding": { group: "documents", page: "branding" },
  "/contacts/settings": { group: "contacts", page: "general" },
  "/sales/settings": { group: "sales", page: "defaults" },
  "/purchases/settings": { group: "purchases", page: "defaults" },
  "/sales/reminders": { group: "sales", page: "reminders" },
  "/banking/rules": { group: "banking", page: "rules" },
  "/banking/feeds": { group: "banking", page: "feeds" },
  "/banking/import": { group: "banking", page: "import" },
};

export function settingsRouteForLegacyPath(path: string) {
  return legacyPaths[path];
}

export function settingsRouteForSection(section: SettingsCategory) {
  if (section === "documents") return { group: "documents" as const, page: "numbering" };
  if (section === "portals") return { group: "portals" as const, page: "access" };
  return { group: section, page: "overview" };
}

export function settingsRouteForPanel(
  panel: SettingsPanelId,
): { group: SettingsCategory; page: string } | undefined {
  for (const [path, route] of Object.entries(detailRoutes)) {
    if (route.panel === panel) {
      const [group, page] = path.split("/") as [SettingsCategory, string];
      return { group, page };
    }
  }
  if (panel.startsWith("category:")) {
    const section = panel.slice("category:".length) as SettingsCategory;
    return settingsRouteForSection(section);
  }
  if (panel === "numbering") return { group: "documents", page: "numbering" };
  if (panel === "portals") return { group: "portals", page: "access" };
  return undefined;
}

export function settingsRoutePath(route: { group: string; page: string }) {
  return `/settings/${encodeURIComponent(route.group)}/${encodeURIComponent(route.page)}`;
}
