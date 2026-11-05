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
  { label: "Settings", to: "/payroll/settings" as const, key: "settings" as const },
] as const;

export type PayrollSubnavSection = (typeof ITEMS)[number]["key"];

export function PayrollSubnav({ current }: { current: PayrollSubnavSection }) {
  return (
    <nav aria-label="Payroll sections" className="mb-6 flex flex-wrap gap-2 border-b pb-3">
      {ITEMS.map((item) => {
        const active = current === item.key;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
