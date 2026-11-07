import { Link } from "@tanstack/react-router";
import { useCan } from "@/hooks/use-can";
import {
  EXPENSE_MANAGEMENT_SECTIONS,
  type ExpenseManagementSectionKey,
} from "@/lib/expenses/sections";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function ExpenseManagementSubnav({
  current,
}: {
  current: ExpenseManagementSectionKey;
}) {
  const { can } = useCan();
  const visible = EXPENSE_MANAGEMENT_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <nav
      aria-label="Expense Management sections"
      className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {visible.map((item) => {
        const active = current === item.key;
        const className = cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );
        if (item.key === "overview") {
          return (
            <Link
              key={item.key}
              to="/expense-management"
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <Link
            key={item.key}
            to="/expense-management/$section"
            params={{ section: item.key }}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
