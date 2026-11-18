export const PM_BASE = "/property-management" as const;

export const PM_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    path: PM_BASE,
    exact: true,
    group: "workspace",
    anyOf: ["property.view", "property.settings.manage"] as const,
    batch: "PM-01",
  },
  {
    key: "properties",
    label: "Properties",
    path: `${PM_BASE}/properties`,
    group: "portfolio",
    anyOf: ["property.view", "property.manage"] as const,
    batch: "PM-01",
  },
  {
    key: "units",
    label: "Units",
    path: `${PM_BASE}/units`,
    group: "portfolio",
    anyOf: ["property.view", "property.manage"] as const,
    batch: "PM-01",
  },
  {
    key: "owners",
    label: "Owners",
    path: `${PM_BASE}/owners`,
    group: "portfolio",
    anyOf: ["property.view", "property.owner.view", "property.owner.manage"] as const,
    batch: "PM-01",
  },
  {
    key: "agreements",
    label: "Agreements",
    path: `${PM_BASE}/agreements`,
    group: "portfolio",
    anyOf: ["property.view", "property.manage", "property.commission.manage"] as const,
    batch: "PM-02",
  },
  {
    key: "tenants-guests",
    label: "Tenants & Guests",
    path: `${PM_BASE}/tenants-guests`,
    group: "occupancy",
    anyOf: ["property.view", "property.tenant.manage"] as const,
    batch: "PM-03",
  },
  {
    key: "leases",
    label: "Leases",
    path: `${PM_BASE}/leases`,
    group: "occupancy",
    anyOf: ["property.view", "property.lease.manage"] as const,
    batch: "PM-03",
  },
  {
    key: "reservations",
    label: "Reservations",
    path: `${PM_BASE}/reservations`,
    group: "occupancy",
    anyOf: ["property.view", "property.reservation.manage"] as const,
    batch: "PM-04",
  },
  {
    key: "calendar",
    label: "Calendar",
    path: `${PM_BASE}/calendar`,
    group: "occupancy",
    anyOf: ["property.view", "property.reservation.manage", "property.lease.manage"] as const,
    batch: "PM-04",
  },
  {
    key: "rent-charges",
    label: "Rent & Charges",
    path: `${PM_BASE}/rent-charges`,
    group: "money",
    anyOf: ["property.view", "property.rent.manage"] as const,
    batch: "PM-03",
  },
  {
    key: "collections",
    label: "Collections",
    path: `${PM_BASE}/collections`,
    group: "money",
    anyOf: ["property.view", "property.rent.manage"] as const,
    batch: "PM-09",
  },
  {
    key: "expenses",
    label: "Expenses",
    path: `${PM_BASE}/expenses`,
    group: "money",
    anyOf: ["property.view", "property.expenses.manage"] as const,
    batch: "PM-05",
  },
  {
    key: "maintenance",
    label: "Maintenance",
    path: `${PM_BASE}/maintenance`,
    group: "operations",
    anyOf: ["property.view", "property.expenses.manage"] as const,
    batch: "PM-05",
  },
  {
    key: "management-fees",
    label: "Management Fees",
    path: `${PM_BASE}/management-fees`,
    group: "settlement",
    anyOf: ["property.view", "property.commission.manage"] as const,
    batch: "PM-06",
  },
  {
    key: "owner-statements",
    label: "Owner Statements",
    path: `${PM_BASE}/owner-statements`,
    group: "settlement",
    anyOf: [
      "property.statements.view",
      "property.statements.generate",
      "property.statements.approve",
      "property.statements.publish",
    ] as const,
    batch: "PM-07",
  },
  {
    key: "owner-payouts",
    label: "Owner Payouts",
    path: `${PM_BASE}/owner-payouts`,
    group: "settlement",
    anyOf: [
      "property.payouts.prepare",
      "property.payouts.approve",
      "property.payouts.record",
    ] as const,
    batch: "PM-09",
  },
  {
    key: "trust-accounting",
    label: "Trust Accounting",
    path: `${PM_BASE}/trust-accounting`,
    group: "settlement",
    anyOf: ["property.trust.reconcile", "property.view"] as const,
    batch: "PM-09",
  },
  {
    key: "owner-portal",
    label: "Owner Portal",
    path: `${PM_BASE}/owner-portal`,
    group: "portals",
    anyOf: ["property.view", "property.owner.manage", "property.settings.manage"] as const,
    batch: "PM-10",
  },
  {
    key: "tenant-portal",
    label: "Tenant Portal",
    path: `${PM_BASE}/tenant-portal`,
    group: "portals",
    anyOf: ["property.view", "property.tenant.manage", "property.settings.manage"] as const,
    batch: "PM-10",
  },
  {
    key: "reports",
    label: "Reports",
    path: `${PM_BASE}/reports`,
    group: "insights",
    anyOf: ["property.reports.view", "property.reports.export"] as const,
    batch: "PM-11",
  },
  {
    key: "integrations",
    label: "Integrations",
    path: `${PM_BASE}/integrations`,
    group: "insights",
    anyOf: ["property.integrations.manage"] as const,
    batch: "PM-12",
  },
  {
    key: "automation",
    label: "Automation",
    path: `${PM_BASE}/automation`,
    group: "insights",
    anyOf: ["property.settings.manage"] as const,
    batch: "PM-12",
  },
  {
    key: "settings",
    label: "Settings",
    path: `${PM_BASE}/settings`,
    group: "admin",
    anyOf: ["property.settings.manage"] as const,
    batch: "PM-01",
  },
] as const;

export type PmSectionKey = (typeof PM_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(PM_SECTIONS.map((s) => s.key));

export function isPmSectionKey(value: string): value is PmSectionKey {
  return SECTION_KEYS.has(value);
}

export function pmSection(key: PmSectionKey): (typeof PM_SECTIONS)[number] {
  const found = PM_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown Property Management section: ${key}`);
  return found;
}

export const PM_SUBNAV = PM_SECTIONS.map((s) => ({
  to: s.path,
  label: s.label,
  ...("exact" in s && s.exact ? { exact: true as const } : {}),
}));
