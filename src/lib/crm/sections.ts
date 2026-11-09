export const CRM_BASE = "/crm" as const;

export const CRM_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    path: CRM_BASE,
    exact: true,
    group: "workspace",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-02",
  },
  {
    key: "leads",
    label: "Leads",
    path: `${CRM_BASE}/leads`,
    group: "pipeline",
    anyOf: ["crm.view", "crm.leads.manage", "crm.admin"] as const,
    batch: "CRM-03",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    path: `${CRM_BASE}/opportunities`,
    group: "pipeline",
    anyOf: ["crm.view", "crm.opportunities.manage", "crm.admin"] as const,
    batch: "CRM-05",
  },
  {
    key: "pipelines",
    label: "Pipelines",
    path: `${CRM_BASE}/pipelines`,
    group: "pipeline",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-05",
  },
  {
    key: "accounts",
    label: "Accounts",
    path: `${CRM_BASE}/accounts`,
    group: "relationships",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-04",
  },
  {
    key: "contacts",
    label: "CRM Contacts",
    path: `${CRM_BASE}/contacts`,
    group: "relationships",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-04",
  },
  {
    key: "activities",
    label: "Activities",
    path: `${CRM_BASE}/activities`,
    group: "engagement",
    anyOf: ["crm.view", "crm.activities.manage", "crm.admin"] as const,
    batch: "CRM-06",
  },
  {
    key: "tasks",
    label: "Tasks & Follow-ups",
    path: `${CRM_BASE}/tasks`,
    group: "engagement",
    anyOf: ["crm.view", "crm.activities.manage", "crm.admin"] as const,
    batch: "CRM-06",
  },
  {
    key: "calendar",
    label: "Calendar & Meetings",
    path: `${CRM_BASE}/calendar`,
    group: "engagement",
    anyOf: ["crm.view", "crm.activities.manage", "crm.admin"] as const,
    batch: "CRM-06",
  },
  {
    key: "communications",
    label: "Communications",
    path: `${CRM_BASE}/communications`,
    group: "engagement",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-07",
  },
  {
    key: "quotes",
    label: "Quotes & Proposals",
    path: `${CRM_BASE}/quotes`,
    group: "revenue",
    anyOf: ["crm.view", "crm.opportunities.manage", "crm.admin"] as const,
    batch: "CRM-08",
  },
  {
    key: "campaigns",
    label: "Campaigns & Sources",
    path: `${CRM_BASE}/campaigns`,
    group: "revenue",
    anyOf: ["crm.view", "crm.campaigns.manage", "crm.admin"] as const,
    batch: "CRM-11",
  },
  {
    key: "products",
    label: "Products & Price Lists",
    path: `${CRM_BASE}/products`,
    group: "revenue",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-08",
  },
  {
    key: "forecasting",
    label: "Sales Forecasting",
    path: `${CRM_BASE}/forecasting`,
    group: "insights",
    anyOf: ["crm.view", "crm.reports.view", "crm.admin"] as const,
    batch: "CRM-11",
  },
  {
    key: "relationships",
    label: "Customer Relationships",
    path: `${CRM_BASE}/relationships`,
    group: "insights",
    anyOf: ["crm.view", "crm.admin"] as const,
    batch: "CRM-09",
  },
  {
    key: "automation",
    label: "Automation",
    path: `${CRM_BASE}/automation`,
    group: "insights",
    anyOf: ["crm.automation.manage", "crm.admin"] as const,
    batch: "CRM-10",
  },
  {
    key: "reports",
    label: "CRM Reports",
    path: `${CRM_BASE}/reports`,
    group: "insights",
    anyOf: ["crm.reports.view", "crm.view", "crm.admin"] as const,
    batch: "CRM-11",
  },
  {
    key: "team",
    label: "Team & Territories",
    path: `${CRM_BASE}/team`,
    group: "admin",
    anyOf: ["crm.admin"] as const,
    batch: "CRM-12",
  },
  {
    key: "imports",
    label: "Imports & Exports",
    path: `${CRM_BASE}/imports`,
    group: "admin",
    anyOf: ["crm.import", "crm.export", "crm.admin"] as const,
    batch: "CRM-12",
  },
  {
    key: "settings",
    label: "CRM Settings",
    path: `${CRM_BASE}/settings`,
    group: "admin",
    anyOf: ["crm.admin"] as const,
    batch: "CRM-02",
  },
] as const;

export type CrmSectionKey = (typeof CRM_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(CRM_SECTIONS.map((s) => s.key));

export function isCrmSectionKey(value: string): value is CrmSectionKey {
  return SECTION_KEYS.has(value);
}

export function crmSection(key: CrmSectionKey): (typeof CRM_SECTIONS)[number] {
  const found = CRM_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown CRM section: ${key}`);
  return found;
}

export const CRM_SUBNAV = CRM_SECTIONS.map((s) => ({
  to: s.path,
  label: s.label,
  ...("exact" in s && s.exact ? { exact: true as const } : {}),
}));
