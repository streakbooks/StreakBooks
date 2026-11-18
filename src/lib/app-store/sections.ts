export const APP_STORE_BASE = "/app-store" as const;
export const DEVELOPER_PORTAL_BASE = "/developer" as const;

export const APP_STORE_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    path: APP_STORE_BASE,
    group: "discover",
    exact: true,
    anyOf: ["appstore.view"] as const,
    batch: "AS-01",
  },
  {
    key: "explore",
    label: "Explore All Apps",
    path: `${APP_STORE_BASE}/explore`,
    group: "discover",
    anyOf: ["appstore.view"] as const,
    batch: "AS-01",
  },
  {
    key: "categories",
    label: "Categories",
    path: `${APP_STORE_BASE}/categories`,
    group: "discover",
    anyOf: ["appstore.view"] as const,
    batch: "AS-01",
  },
  {
    key: "featured",
    label: "Featured & Recommended",
    path: `${APP_STORE_BASE}/featured`,
    group: "discover",
    anyOf: ["appstore.view"] as const,
    batch: "AS-01",
  },
  {
    key: "register",
    label: "Integration Register",
    path: `${APP_STORE_BASE}/register`,
    group: "discover",
    anyOf: ["appstore.view"] as const,
    batch: "AS-03",
  },
  {
    key: "my-apps",
    label: "My Apps",
    path: `${APP_STORE_BASE}/my-apps`,
    group: "manage",
    anyOf: ["appstore.view", "appstore.install", "appstore.manage_connections"] as const,
    batch: "AS-02",
  },
  {
    key: "connections",
    label: "Connections",
    path: `${APP_STORE_BASE}/connections`,
    group: "manage",
    anyOf: ["appstore.manage_connections", "appstore.view"] as const,
    batch: "AS-02",
  },
  {
    key: "privacy",
    label: "Privacy & Access",
    path: `${APP_STORE_BASE}/privacy`,
    group: "manage",
    anyOf: ["appstore.manage_connections", "appstore.view"] as const,
    batch: "AS-SEC",
  },
  {
    key: "sync-activity",
    label: "Synchronization Activity",
    path: `${APP_STORE_BASE}/sync-activity`,
    group: "operations",
    anyOf: ["appstore.view_sync", "appstore.view"] as const,
    batch: "AS-03",
  },
  {
    key: "exceptions",
    label: "Integration Exceptions",
    path: `${APP_STORE_BASE}/exceptions`,
    group: "operations",
    anyOf: ["appstore.resolve_exceptions", "appstore.view"] as const,
    batch: "AS-04",
  },
  {
    key: "requests",
    label: "App Requests",
    path: `${APP_STORE_BASE}/requests`,
    group: "manage",
    anyOf: ["appstore.request_install", "appstore.install", "appstore.view"] as const,
    batch: "AS-02",
  },
  {
    key: "advisory",
    label: "Accountant Advisory",
    path: `${APP_STORE_BASE}/advisory`,
    group: "manage",
    anyOf: ["appstore.advise"] as const,
    batch: "AS-XP-02",
  },
  {
    key: "billing",
    label: "App Billing",
    path: `${APP_STORE_BASE}/billing`,
    group: "admin",
    anyOf: ["appstore.view"] as const,
    batch: "AS-05",
  },
  {
    key: "reviews",
    label: "Ratings & Reviews",
    path: `${APP_STORE_BASE}/reviews`,
    group: "discover",
    anyOf: ["appstore.view"] as const,
    batch: "AS-05",
  },
  {
    key: "trust",
    label: "Trust & Certification",
    path: `${APP_STORE_BASE}/trust`,
    group: "admin",
    anyOf: ["appstore.view", "appstore.manage_certification"] as const,
    batch: "AS-XP-10",
  },
  {
    key: "admin",
    label: "Platform Administration",
    path: `${APP_STORE_BASE}/admin`,
    group: "admin",
    anyOf: ["appstore.manage_certification"] as const,
    batch: "AS-06",
  },
] as const;

export type AppStoreSectionKey = (typeof APP_STORE_SECTIONS)[number]["key"];

export function isAppStoreSectionKey(value: string): value is AppStoreSectionKey {
  return APP_STORE_SECTIONS.some((s) => s.key === value);
}

export function appStoreSection(key: AppStoreSectionKey) {
  const section = APP_STORE_SECTIONS.find((s) => s.key === key);
  if (!section) throw new Error(`Unknown App Store section: ${key}`);
  return section;
}

export const DEVELOPER_PORTAL_SECTIONS = [
  {
    key: "dashboard",
    label: "Developer Dashboard",
    path: DEVELOPER_PORTAL_BASE,
    exact: true,
    anyOf: ["developer.manage_apps", "developer.submit_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "publisher",
    label: "Publisher Profile",
    path: `${DEVELOPER_PORTAL_BASE}/publisher`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "applications",
    label: "My Applications",
    path: `${DEVELOPER_PORTAL_BASE}/applications`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "register",
    label: "Register Application",
    path: `${DEVELOPER_PORTAL_BASE}/register`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "credentials",
    label: "API Credentials",
    path: `${DEVELOPER_PORTAL_BASE}/credentials`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "oauth",
    label: "OAuth Configuration",
    path: `${DEVELOPER_PORTAL_BASE}/oauth`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "api-docs",
    label: "API Documentation",
    path: `${DEVELOPER_PORTAL_BASE}/api-docs`,
    anyOf: ["developer.manage_apps", "appstore.view"] as const,
    batch: "AS-01",
  },
  {
    key: "webhooks",
    label: "Webhooks",
    path: `${DEVELOPER_PORTAL_BASE}/webhooks`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "sandbox",
    label: "Sandbox & Testing",
    path: `${DEVELOPER_PORTAL_BASE}/sandbox`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "submission",
    label: "App Submission",
    path: `${DEVELOPER_PORTAL_BASE}/submission`,
    anyOf: ["developer.submit_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "versions",
    label: "Version Management",
    path: `${DEVELOPER_PORTAL_BASE}/versions`,
    anyOf: ["developer.manage_apps"] as const,
    batch: "AS-05",
  },
  {
    key: "analytics",
    label: "Developer Analytics",
    path: `${DEVELOPER_PORTAL_BASE}/analytics`,
    anyOf: ["developer.view_analytics", "developer.manage_apps"] as const,
    batch: "AS-XP-07",
  },
  {
    key: "usage",
    label: "API Usage",
    path: `${DEVELOPER_PORTAL_BASE}/usage`,
    anyOf: ["developer.view_usage", "developer.manage_apps"] as const,
    batch: "AS-XP-06",
  },
  {
    key: "partner",
    label: "Partner Program",
    path: `${DEVELOPER_PORTAL_BASE}/partner`,
    anyOf: ["developer.partner_manage", "developer.manage_apps"] as const,
    batch: "AS-XP-05",
  },
  {
    key: "support",
    label: "Support",
    path: `${DEVELOPER_PORTAL_BASE}/support`,
    anyOf: ["developer.manage_apps", "developer.submit_apps"] as const,
    batch: "AS-05",
  },
] as const;

export type DeveloperPortalSectionKey = (typeof DEVELOPER_PORTAL_SECTIONS)[number]["key"];

export function isDeveloperPortalSectionKey(value: string): value is DeveloperPortalSectionKey {
  return DEVELOPER_PORTAL_SECTIONS.some((s) => s.key === value);
}

export function developerPortalSection(key: DeveloperPortalSectionKey) {
  const section = DEVELOPER_PORTAL_SECTIONS.find((s) => s.key === key);
  if (!section) throw new Error(`Unknown Developer Portal section: ${key}`);
  return section;
}
