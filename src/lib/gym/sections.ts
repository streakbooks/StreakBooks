export const GYM_BASE = "/gym" as const;

export const GYM_SECTIONS = [
  { key: "overview", label: "Dashboard", path: GYM_BASE, exact: true, group: "overview", anyOf: ["gym.view"] },
  { key: "actions", label: "Smart Action Centre", path: `${GYM_BASE}/actions`, group: "overview", anyOf: ["gym.view"] },
  { key: "members", label: "Members", path: `${GYM_BASE}/members`, group: "members", anyOf: ["gym.view", "gym.members.manage"] },
  { key: "plans", label: "Membership plans", path: `${GYM_BASE}/plans`, group: "members", anyOf: ["gym.view", "gym.plans.manage"] },
  { key: "memberships", label: "Memberships", path: `${GYM_BASE}/memberships`, group: "members", anyOf: ["gym.view", "gym.members.manage"] },
  { key: "appointments", label: "Appointments", path: `${GYM_BASE}/appointments`, group: "scheduling", anyOf: ["gym.view", "gym.schedule.manage"] },
  { key: "classes", label: "Classes", path: `${GYM_BASE}/classes`, group: "scheduling", anyOf: ["gym.view", "gym.schedule.manage"] },
  { key: "attendance", label: "Attendance", path: `${GYM_BASE}/attendance`, group: "scheduling", anyOf: ["gym.view", "gym.attendance.manage"] },
  { key: "trainers", label: "Trainers", path: `${GYM_BASE}/trainers`, group: "scheduling", anyOf: ["gym.view", "gym.trainers.manage"] },
  { key: "equipment", label: "Equipment", path: `${GYM_BASE}/equipment`, group: "scheduling", anyOf: ["gym.view", "gym.manage"] },
  { key: "billing", label: "Billing", path: `${GYM_BASE}/billing`, group: "finance", anyOf: ["gym.view", "gym.billing.manage"] },
  { key: "payments", label: "Payments", path: `${GYM_BASE}/payments`, group: "finance", anyOf: ["gym.view", "gym.billing.manage"] },
  { key: "statements", label: "Statements", path: `${GYM_BASE}/statements`, group: "finance", anyOf: ["gym.view", "gym.export"] },
  { key: "deferred", label: "Deferred revenue", path: `${GYM_BASE}/deferred`, group: "finance", anyOf: ["gym.view", "gym.post"] },
  { key: "packages", label: "Training packages", path: `${GYM_BASE}/packages`, group: "finance", anyOf: ["gym.view", "gym.billing.manage"] },
  { key: "commissions", label: "Commissions", path: `${GYM_BASE}/commissions`, group: "finance", anyOf: ["gym.view", "gym.approve"] },
  { key: "leads", label: "Leads", path: `${GYM_BASE}/leads`, group: "business", anyOf: ["gym.view", "gym.manage"] },
  { key: "branches", label: "Branches", path: `${GYM_BASE}/branches`, group: "business", anyOf: ["gym.view", "gym.admin"] },
  { key: "budgets", label: "Budgets", path: `${GYM_BASE}/budgets`, group: "business", anyOf: ["gym.view", "gym.admin"] },
  { key: "portal", label: "Member portal", path: `${GYM_BASE}/portal`, group: "business", anyOf: ["gym.view", "gym.portal.manage"] },
  { key: "reports", label: "Reports", path: `${GYM_BASE}/reports`, group: "business", anyOf: ["gym.view", "gym.export"] },
  { key: "settings", label: "Settings", path: `${GYM_BASE}/settings`, group: "business", anyOf: ["gym.view", "gym.admin"] },
] as const;

export type GymSectionKey = (typeof GYM_SECTIONS)[number]["key"];

const SECTION_KEYS = new Set<string>(GYM_SECTIONS.map((section) => section.key));

export function isGymSectionKey(value: string): value is GymSectionKey {
  return SECTION_KEYS.has(value);
}

export function gymSection(key: GymSectionKey): (typeof GYM_SECTIONS)[number] {
  const found = GYM_SECTIONS.find((section) => section.key === key);
  if (!found) throw new Error(`Unknown Gym section: ${key}`);
  return found;
}

export const GYM_SUBNAV = GYM_SECTIONS.map((section) => ({
  to: section.path,
  label: section.label,
  ...("exact" in section && section.exact ? { exact: true as const } : {}),
}));
