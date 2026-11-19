/** Payroll navigation groups for GroupedModuleSubnav (Batch 43). */
export const PAYROLL_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "operations", label: "Pay operations" },
  { key: "admin", label: "Administration" },
] as const;

export type PayrollGroupKey = (typeof PAYROLL_GROUPS)[number]["key"];
