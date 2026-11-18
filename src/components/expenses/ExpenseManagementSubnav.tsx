import { Link } from "@tanstack/react-router";
import {
  GroupedModuleSubnav,
  groupedModuleSectionClassName,
} from "@/components/common/GroupedModuleSubnav";
import { useCan } from "@/hooks/use-can";
import {
  EXPENSE_MANAGEMENT_SECTIONS,
  type ExpenseManagementSectionKey,
} from "@/lib/expenses/sections";
import type { Permission } from "@/lib/permissions";

const EXPENSE_GROUPS = [
  { key: "workspace", label: "Overview" },
  { key: "claims", label: "Claims" },
  { key: "travel", label: "Travel" },
  { key: "money", label: "Money" },
  { key: "insights", label: "Reports" },
  { key: "admin", label: "Administration" },
] as const;

/**
 * Compact two-row Expenses navigation — replaces a long single horizontal strip.
 */
export function ExpenseManagementSubnav({ current }: { current: ExpenseManagementSectionKey }) {
  const { can } = useCan();
  const visible = EXPENSE_MANAGEMENT_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <GroupedModuleSubnav
      label="Expenses"
      groups={EXPENSE_GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/expense-management"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link
            to="/expense-management"
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {section.label}
          </Link>
        ) : (
          <Link
            to="/expense-management/$section"
            params={{ section: section.key }}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      }}
    />
  );
}
