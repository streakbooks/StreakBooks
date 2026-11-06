import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/advisors-admin", label: "Overview", exact: true },
  { to: "/advisors-admin/inquiries", label: "Inquiries" },
  { to: "/advisors-admin/conversations", label: "Conversations" },
  { to: "/advisors-admin/clients", label: "Clients" },
  { to: "/advisors-admin/engagements", label: "Engagements" },
  { to: "/advisors-admin/onboarding", label: "Onboarding" },
  { to: "/advisors-admin/billing", label: "Billing" },
  { to: "/advisors-admin/workspaces", label: "Workspaces" },
  { to: "/advisors-admin/documents", label: "Documents" },
  { to: "/advisors-admin/appointments", label: "Appointments" },
  { to: "/advisors-admin/staff", label: "Advisors" },
  { to: "/advisors-admin/settings/services-pricing", label: "Services & Pricing" },
] as const;

export function AdvisorsSubnav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Advisors administration" className="flex flex-wrap gap-2">
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
