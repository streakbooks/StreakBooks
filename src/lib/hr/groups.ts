/**
 * Premium HR navigation groups (presentation only).
 * Section keys and routes stay stable in `sections.ts`.
 */
export const HR_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "recruitment", label: "Recruitment" },
  { key: "time", label: "Time & Leave" },
  { key: "performance", label: "Performance" },
  { key: "compensation", label: "Compensation" },
  { key: "reports", label: "Reports" },
  { key: "admin", label: "Administration" },
] as const;

export type HrGroupKey = (typeof HR_GROUPS)[number]["key"];
