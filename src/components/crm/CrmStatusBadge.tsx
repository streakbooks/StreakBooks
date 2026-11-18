import { Badge } from "@/components/ui/badge";
import { crmStatusAppearance } from "@/lib/crm/status-appearance";

/** Consistent theme-aware status across lead, deal, task and revenue workspaces. */
export function CrmStatusBadge({ status }: { status: string }) {
  const { variant, label } = crmStatusAppearance(status);
  return (
    <Badge variant={variant} aria-label={`Status: ${label}`}>
      {label}
    </Badge>
  );
}
