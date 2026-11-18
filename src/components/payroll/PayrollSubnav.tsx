import { Link } from "@tanstack/react-router";
import {
  GroupedModuleSubnav,
  groupedModuleSectionClassName,
} from "@/components/common/GroupedModuleSubnav";
import { PAYROLL_GROUPS } from "@/lib/payroll/groups";

const PAYROLL_SECTIONS = [
  { key: "overview", label: "Overview", group: "overview", to: "/payroll" as const },
  { key: "employees", label: "Employees", group: "people", to: "/payroll/employees" as const },
  {
    key: "salary-structures",
    label: "Salary structures",
    group: "operations",
    to: "/payroll/salary-structures" as const,
  },
  { key: "runs", label: "Runs", group: "operations", to: "/payroll/runs" as const },
  { key: "payslips", label: "Payslips", group: "operations", to: "/payroll/payslips" as const },
  { key: "payments", label: "Payments", group: "operations", to: "/payroll/payments" as const },
  { key: "reports", label: "Reports", group: "admin", to: "/payroll/reports" as const },
  { key: "settings", label: "Settings", group: "admin", to: "/payroll/settings" as const },
] as const;

export type PayrollSubnavSection = (typeof PAYROLL_SECTIONS)[number]["key"];

/**
 * Compact Payroll navigation — grouped strip distinct from HR profiles.
 * Routes and labels unchanged; presentation only.
 */
export function PayrollSubnav({ current }: { current: PayrollSubnavSection }) {
  return (
    <GroupedModuleSubnav
      label="Payroll"
      groups={PAYROLL_GROUPS}
      sections={PAYROLL_SECTIONS}
      current={current}
      overview={
        current !== "overview" ? (
          <Link
            to="/payroll"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const item = PAYROLL_SECTIONS.find((entry) => entry.key === section.key);
        if (!item) return null;
        return (
          <Link
            to={item.to}
            className={groupedModuleSectionClassName(active)}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      }}
    />
  );
}
