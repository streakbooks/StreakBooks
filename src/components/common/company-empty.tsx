import type { ReactNode } from "react";
import type { Inbox } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { useActiveCompany } from "@/hooks/use-active-company";

/** Shown in place of a figure while the active company has no posted records. */
export const NO_FIGURE = "—";

/**
 * Empty state scoped to the active company. Company-owned records are not
 * stored yet, so this states plainly that the selected company has none —
 * it never substitutes sample data.
 *
 * CTAs must be real: pass `action`, or `actionLabel` + `onActionClick` together.
 */
export function CompanyEmptyState({
  title,
  description,
  actionLabel,
  onActionClick,
  action,
  icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onActionClick?: () => void;
  action?: ReactNode;
  icon?: typeof Inbox;
}) {
  const { company } = useActiveCompany();
  const scope = company ? `${company.name} has no records here yet. ` : "";
  return (
    <EmptyState
      title={title}
      description={`${scope}${description}`}
      {...(action !== undefined ? { action } : {})}
      {...(actionLabel !== undefined && onActionClick !== undefined
        ? { actionLabel, onActionClick }
        : {})}
      {...(icon !== undefined ? { icon } : {})}
    />
  );
}
