import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Overview", to: "/payroll" as const },
  { label: "Settings", to: "/payroll/settings" as const },
] as const;

export function PayrollSubnav({ current }: { current: "overview" | "settings" }) {
  return (
    <nav aria-label="Payroll sections" className="mb-6 flex flex-wrap gap-2 border-b pb-3">
      {ITEMS.map((item) => {
        const active =
          (current === "overview" && item.to === "/payroll") ||
          (current === "settings" && item.to === "/payroll/settings");
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
