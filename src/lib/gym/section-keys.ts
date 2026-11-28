/** Route keys only. Labels stay with the gym screen so the app shell stays small. */
const GYM_SECTION_KEYS = [
  "overview",
  "actions",
  "members",
  "plans",
  "memberships",
  "appointments",
  "classes",
  "attendance",
  "trainers",
  "equipment",
  "billing",
  "payments",
  "statements",
  "deferred",
  "packages",
  "commissions",
  "leads",
  "branches",
  "budgets",
  "portal",
  "reports",
  "settings",
] as const;

export function isGymSectionKey(value: string): boolean {
  return (GYM_SECTION_KEYS as readonly string[]).includes(value);
}

export { GYM_SECTION_KEYS };
