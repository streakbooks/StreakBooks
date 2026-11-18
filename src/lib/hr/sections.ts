export const HR_BASE = "/hr" as const;

/**
 * HR Management navigation. Keys must stay stable for deep links.
 * Later-batch sections remain registered and fail-closed until backends ship.
 */
export const HR_SECTIONS = [
  {
    key: "overview",
    label: "HR Overview",
    path: HR_BASE,
    exact: true,
    group: "overview",
    anyOf: ["hr.view", "hr.settings.edit"] as const,
    batch: "HR-02",
  },
  {
    key: "employees",
    label: "Employees",
    path: `${HR_BASE}/employees`,
    group: "people",
    anyOf: ["hr.view", "hr.employees.manage"] as const,
    batch: "HR-02",
  },
  {
    key: "organization",
    label: "Organization",
    path: `${HR_BASE}/organization`,
    group: "people",
    anyOf: ["hr.view", "hr.organization.manage"] as const,
    batch: "HR-03",
  },
  {
    key: "recruitment",
    label: "Recruitment",
    path: `${HR_BASE}/recruitment`,
    group: "recruitment",
    anyOf: ["hr.view", "hr.recruitment.manage"] as const,
    batch: "HR-04",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    path: `${HR_BASE}/onboarding`,
    group: "recruitment",
    anyOf: ["hr.view", "hr.onboarding.manage"] as const,
    batch: "HR-04",
  },
  {
    key: "attendance",
    label: "Attendance",
    path: `${HR_BASE}/attendance`,
    group: "time",
    anyOf: ["hr.view", "hr.attendance.manage", "hr.self_service", "hr.manager"] as const,
    batch: "HR-05",
  },
  {
    key: "shifts",
    label: "Shifts & Rosters",
    path: `${HR_BASE}/shifts`,
    group: "time",
    anyOf: ["hr.view", "hr.attendance.manage"] as const,
    batch: "HR-05",
  },
  {
    key: "leave",
    label: "Leave Management",
    path: `${HR_BASE}/leave`,
    group: "time",
    anyOf: [
      "hr.view",
      "hr.leave.manage",
      "hr.leave.approve",
      "hr.self_service",
      "hr.manager",
    ] as const,
    batch: "HR-06",
  },
  {
    key: "holidays",
    label: "Holidays & Calendar",
    path: `${HR_BASE}/holidays`,
    group: "time",
    anyOf: ["hr.view", "hr.leave.manage"] as const,
    batch: "HR-06",
  },
  {
    key: "documents",
    label: "Employee Documents",
    path: `${HR_BASE}/documents`,
    group: "people",
    anyOf: ["hr.view", "hr.employees.manage", "hr.self_service"] as const,
    batch: "HR-08",
  },
  {
    key: "self-service",
    label: "Employee Self-Service",
    path: `${HR_BASE}/self-service`,
    group: "overview",
    anyOf: ["hr.self_service", "hr.view"] as const,
    batch: "HR-07",
  },
  {
    key: "manager",
    label: "Manager Workspace",
    path: `${HR_BASE}/manager`,
    group: "overview",
    anyOf: ["hr.manager", "hr.leave.approve", "hr.approvals.manage"] as const,
    batch: "HR-07",
  },
  {
    key: "performance",
    label: "Performance",
    path: `${HR_BASE}/performance`,
    group: "performance",
    anyOf: ["hr.view", "hr.performance.manage"] as const,
    batch: "HR-09",
  },
  {
    key: "training",
    label: "Training & Development",
    path: `${HR_BASE}/training`,
    group: "performance",
    anyOf: ["hr.view", "hr.performance.manage"] as const,
    batch: "HR-09",
  },
  {
    key: "compensation",
    label: "Compensation & Benefits",
    path: `${HR_BASE}/compensation`,
    group: "compensation",
    anyOf: ["hr.employees.sensitive", "hr.employees.manage"] as const,
    batch: "HR-09",
  },
  {
    key: "assets",
    label: "Employee Assets",
    path: `${HR_BASE}/assets`,
    group: "people",
    anyOf: ["hr.view", "hr.employees.manage"] as const,
    batch: "HR-08",
  },
  {
    key: "relations",
    label: "Employee Relations",
    path: `${HR_BASE}/relations`,
    group: "recruitment",
    anyOf: ["hr.cases.manage", "hr.view"] as const,
    batch: "HR-08",
  },
  {
    key: "transfers",
    label: "Transfers & Promotions",
    path: `${HR_BASE}/transfers`,
    group: "recruitment",
    anyOf: ["hr.employees.manage", "hr.view"] as const,
    batch: "HR-10",
  },
  {
    key: "offboarding",
    label: "Offboarding",
    path: `${HR_BASE}/offboarding`,
    group: "recruitment",
    anyOf: ["hr.employees.manage", "hr.view"] as const,
    batch: "HR-10",
  },
  {
    key: "reports",
    label: "HR Reports",
    path: `${HR_BASE}/reports`,
    group: "reports",
    anyOf: ["hr.reports.view", "hr.view"] as const,
    batch: "HR-12",
  },
  {
    key: "approvals",
    label: "HR Approvals",
    path: `${HR_BASE}/approvals`,
    group: "admin",
    anyOf: ["hr.approvals.manage", "hr.manager", "hr.leave.approve"] as const,
    batch: "HR-07",
  },
  {
    key: "automations",
    label: "HR Automations",
    path: `${HR_BASE}/automations`,
    group: "admin",
    anyOf: ["hr.settings.edit", "hr.approvals.manage"] as const,
    batch: "HR-12",
  },
  {
    key: "settings",
    label: "HR Settings",
    path: `${HR_BASE}/settings`,
    group: "admin",
    anyOf: ["hr.settings.edit"] as const,
    batch: "HR-01",
  },
  {
    key: "audit",
    label: "HR Audit Trail",
    path: `${HR_BASE}/audit`,
    group: "admin",
    anyOf: ["hr.audit.view"] as const,
    batch: "HR-01",
  },
] as const;

export type HrSectionKey = (typeof HR_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(HR_SECTIONS.map((s) => s.key));

export function isHrSectionKey(value: string): value is HrSectionKey {
  return SECTION_KEYS.has(value);
}

export function hrSection(key: HrSectionKey): (typeof HR_SECTIONS)[number] {
  const found = HR_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown HR section: ${key}`);
  return found;
}

export const HR_SUBNAV = HR_SECTIONS.map((s) => ({
  to: s.path,
  label: s.label,
  ...("exact" in s && s.exact ? { exact: true as const } : {}),
}));
