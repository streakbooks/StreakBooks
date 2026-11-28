export const RE_BASE = "/real-estate" as const;

export const RE_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    path: RE_BASE,
    exact: true,
    group: "overview",
    anyOf: ["realestate.view"] as const,
  },
  {
    key: "projects",
    label: "Projects",
    path: `${RE_BASE}/projects`,
    group: "inventory",
    anyOf: ["realestate.view", "realestate.manage"] as const,
  },
  {
    key: "inventory",
    label: "Property inventory",
    path: `${RE_BASE}/inventory`,
    group: "inventory",
    anyOf: ["realestate.view", "realestate.inventory.manage"] as const,
  },
  {
    key: "reservations",
    label: "Reservations",
    path: `${RE_BASE}/reservations`,
    group: "sales",
    anyOf: ["realestate.view", "realestate.sales.manage"] as const,
  },
  {
    key: "sales",
    label: "Bookings and sales",
    path: `${RE_BASE}/sales`,
    group: "sales",
    anyOf: ["realestate.view", "realestate.sales.manage"] as const,
  },
  {
    key: "payment-plans",
    label: "Payment plans",
    path: `${RE_BASE}/payment-plans`,
    group: "sales",
    anyOf: ["realestate.view", "realestate.sales.manage"] as const,
  },
  {
    key: "instalments",
    label: "Instalments",
    path: `${RE_BASE}/instalments`,
    group: "sales",
    anyOf: ["realestate.view", "realestate.collections.manage"] as const,
  },
  {
    key: "collections",
    label: "Collections",
    path: `${RE_BASE}/collections`,
    group: "sales",
    anyOf: ["realestate.view", "realestate.collections.manage", "realestate.post"] as const,
  },
  {
    key: "commissions",
    label: "Brokers and commissions",
    path: `${RE_BASE}/commissions`,
    group: "delivery",
    anyOf: ["realestate.view", "realestate.commissions.manage"] as const,
  },
  {
    key: "development-costs",
    label: "Development costs",
    path: `${RE_BASE}/development-costs`,
    group: "delivery",
    anyOf: ["realestate.view", "realestate.costs.manage"] as const,
  },
  {
    key: "budgets",
    label: "Project budgets",
    path: `${RE_BASE}/budgets`,
    group: "delivery",
    anyOf: ["realestate.view", "realestate.budgets.manage"] as const,
  },
  {
    key: "settings",
    label: "Settings",
    path: `${RE_BASE}/settings`,
    group: "admin",
    anyOf: ["realestate.admin", "realestate.view"] as const,
  },
] as const;

export type ReSectionKey = (typeof RE_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(RE_SECTIONS.map((section) => section.key));

export function isReSectionKey(value: string): value is ReSectionKey {
  return SECTION_KEYS.has(value);
}

export function reSection(key: ReSectionKey): (typeof RE_SECTIONS)[number] {
  const found = RE_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown Real Estate section: ${key}`);
  return found;
}

export const RE_SUBNAV = RE_SECTIONS.map((section) => ({
  to: section.path,
  label: section.label,
  ...("exact" in section && section.exact ? { exact: true as const } : {}),
}));

export type RealEstateSearch = { project: string; unit: string; sale: string };

export function realEstateSearch(search: { [key: string]: unknown }): RealEstateSearch {
  const project = search["project"];
  const unit = search["unit"];
  const sale = search["sale"];
  return {
    project: typeof project === "string" ? project : "",
    unit: typeof unit === "string" ? unit : "",
    sale: typeof sale === "string" ? sale : "",
  };
}
