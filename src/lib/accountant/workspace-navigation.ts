/**
 * Accountant workspace navigation lives in one place so URL deep-links cannot
 * silently land on a blank or inaccessible tab.
 */
export const ACCOUNTANT_WORKSPACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "client-work", label: "Client work" },
  { id: "journals", label: "Journals" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "period-close", label: "Period close" },
  { id: "tax-adjustments", label: "Tax adjustments" },
] as const;

export type AccountantWorkspaceTab = (typeof ACCOUNTANT_WORKSPACE_TABS)[number]["id"];

export function parseAccountantWorkspaceTab(value: unknown): AccountantWorkspaceTab {
  return ACCOUNTANT_WORKSPACE_TABS.find((tab) => tab.id === value)?.id ?? "overview";
}
