import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/advisors-admin/settings/services-pricing", label: "Services & Pricing" },
] as const;

export function AdvisorsSubnav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Advisors settings" className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              active
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
