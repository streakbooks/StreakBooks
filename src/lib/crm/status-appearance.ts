/** Theme-aware semantic CRM statuses; colors come from LinkBooks' design tokens. */
export const CRM_STATUS_VARIANTS = {
  new: "info",
  contacted: "info",
  qualified: "success",
  nurturing: "warning",
  converted: "complete",
  disqualified: "danger",
  open: "info",
  won: "success",
  lost: "danger",
  completed: "complete",
  cancelled: "neutral",
  planned: "neutral",
  active: "success",
  paused: "warning",
  archived: "neutral",
} as const;

export type CrmStatusVariant =
  | "neutral" | "info" | "success" | "warning" | "complete" | "danger";

export function crmStatusAppearance(status: string): {
  variant: CrmStatusVariant;
  label: string;
} {
  const key = status.trim().toLowerCase();
  const variant: CrmStatusVariant =
    CRM_STATUS_VARIANTS[key as keyof typeof CRM_STATUS_VARIANTS] ?? "neutral";
  const label = (key || "unknown")
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return { variant, label };
}
