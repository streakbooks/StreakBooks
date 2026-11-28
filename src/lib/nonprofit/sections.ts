export const NP_BASE = "/nonprofit" as const;

export const NP_SECTIONS = [
  {
    key: "overview",
    label: "Dashboard",
    path: NP_BASE,
    exact: true,
    group: "overview",
    anyOf: ["nonprofit.view"] as const,
  },
  {
    key: "funds",
    label: "Funds",
    path: `${NP_BASE}/funds`,
    group: "funds",
    anyOf: ["nonprofit.view", "nonprofit.funds.manage"] as const,
  },
  {
    key: "transfers",
    label: "Transfers and releases",
    path: `${NP_BASE}/transfers`,
    group: "funds",
    anyOf: ["nonprofit.view", "nonprofit.restrictions.release", "nonprofit.post"] as const,
  },
  {
    key: "donors",
    label: "Donors",
    path: `${NP_BASE}/donors`,
    group: "giving",
    anyOf: ["nonprofit.view", "nonprofit.donors.manage"] as const,
  },
  {
    key: "donations",
    label: "Donations",
    path: `${NP_BASE}/donations`,
    group: "giving",
    anyOf: ["nonprofit.view", "nonprofit.donations.manage"] as const,
  },
  {
    key: "pledges",
    label: "Pledges",
    path: `${NP_BASE}/pledges`,
    group: "giving",
    anyOf: ["nonprofit.view", "nonprofit.donations.manage"] as const,
  },
  {
    key: "grants",
    label: "Grants",
    path: `${NP_BASE}/grants`,
    group: "grants",
    anyOf: ["nonprofit.view", "nonprofit.grants.approve"] as const,
  },
  {
    key: "campaigns",
    label: "Campaigns",
    path: `${NP_BASE}/campaigns`,
    group: "fundraising",
    anyOf: ["nonprofit.view", "nonprofit.manage"] as const,
  },
  {
    key: "programmes",
    label: "Programmes",
    path: `${NP_BASE}/programmes`,
    group: "programmes",
    anyOf: ["nonprofit.view", "nonprofit.manage"] as const,
  },
  {
    key: "expenses",
    label: "Functional expenses",
    path: `${NP_BASE}/expenses`,
    group: "finance",
    anyOf: ["nonprofit.view", "nonprofit.post"] as const,
  },
  {
    key: "people",
    label: "People and governance",
    path: `${NP_BASE}/people`,
    group: "people",
    anyOf: ["nonprofit.view", "nonprofit.manage", "nonprofit.beneficiaries.view"] as const,
  },
  {
    key: "reports",
    label: "Fund reports",
    path: `${NP_BASE}/reports`,
    group: "reports",
    anyOf: ["nonprofit.view", "nonprofit.export"] as const,
  },
  {
    key: "portals",
    label: "Portals",
    path: `${NP_BASE}/portals`,
    group: "portals",
    anyOf: ["nonprofit.view", "nonprofit.portal.manage"] as const,
  },
  {
    key: "settings",
    label: "Settings",
    path: `${NP_BASE}/settings`,
    group: "admin",
    anyOf: ["nonprofit.admin", "nonprofit.view"] as const,
  },
] as const;

export type NpSectionKey = (typeof NP_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(NP_SECTIONS.map((section) => section.key));

export function isNpSectionKey(value: string): value is NpSectionKey {
  return SECTION_KEYS.has(value);
}

export function npSection(key: NpSectionKey): (typeof NP_SECTIONS)[number] {
  const found = NP_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown Nonprofit section: ${key}`);
  return found;
}

export const NP_SUBNAV = NP_SECTIONS.map((section) => ({
  to: section.path,
  label: section.label,
  ...("exact" in section && section.exact ? { exact: true as const } : {}),
}));
