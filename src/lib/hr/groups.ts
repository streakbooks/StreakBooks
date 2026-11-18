/**
 * Premium HR navigation groups (presentation only).
 * Section keys and routes stay stable in `sections.ts`.
 *
 * Five-group IA (Batch 43): Overview · People · Workforce · Talent & Lifecycle · Administration
 */
export const HR_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "workforce", label: "Workforce" },
  { key: "talent", label: "Talent & Lifecycle" },
  { key: "admin", label: "Administration" },
] as const;

export type HrGroupKey = (typeof HR_GROUPS)[number]["key"];
