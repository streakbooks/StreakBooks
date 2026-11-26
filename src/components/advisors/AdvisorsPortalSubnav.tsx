import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/advisors-portal", label: "Overview", exact: true },
  { to: "/advisors-portal/appointments", label: "Appointments" },
  { to: "/advisors-portal/tasks", label: "My tasks" },
  { to: "/advisors-portal/documents", label: "Files to send" },
  { to: "/advisors-portal/messages", label: "Messages" },
  { to: "/advisors-portal/account", label: "Account & requests" },
] as const;

export function AdvisorsPortalSubnav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Advisor client portal" className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const exact = "exact" in link && link.exact;
        const active = exact
          ? pathname === link.to || pathname === `${link.to}/`
          : pathname.startsWith(link.to);
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
