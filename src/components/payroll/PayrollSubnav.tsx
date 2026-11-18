import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Overview", to: "/payroll" as const, key: "overview" as const },
  { label: "Employees", to: "/payroll/employees" as const, key: "employees" as const },
  {
    label: "Salary structures",
    to: "/payroll/salary-structures" as const,
    key: "salary-structures" as const,
  },
  { label: "Runs", to: "/payroll/runs" as const, key: "runs" as const },
  { label: "Payslips", to: "/payroll/payslips" as const, key: "payslips" as const },
  { label: "Payments", to: "/payroll/payments" as const, key: "payments" as const },
  { label: "Reports", to: "/payroll/reports" as const, key: "reports" as const },
  { label: "Settings", to: "/payroll/settings" as const, key: "settings" as const },
] as const;

export type PayrollSubnavSection = (typeof ITEMS)[number]["key"];

/** Compact Payroll strip — keep HR profiles vs Payroll operations visually distinct via copy on each screen. */
export function PayrollSubnav({ current }: { current: PayrollSubnavSection }) {
  return (
    <nav
      aria-label="Payroll sections"
      className="mb-3 flex min-w-0 flex-wrap gap-1 border-b border-border pb-2"
    >
      {ITEMS.map((item) => {
        const active = current === item.key;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
