import { Link, useRouterState } from "@tanstack/react-router";
import { GroupedModuleSubnav } from "@/components/common/GroupedModuleSubnav";
import { groupedModuleSectionClassName } from "@/lib/navigation/grouped-module-nav";

const LINKS = [
  { to: "/advisors-admin", label: "Overview", exact: true, group: "workspace" },
  { to: "/advisors-admin/inquiries", label: "Inquiries", group: "pipeline" },
  { to: "/advisors-admin/conversations", label: "Conversations", group: "pipeline" },
  { to: "/advisors-admin/clients", label: "Clients", group: "clients" },
  { to: "/advisors-admin/engagements", label: "Engagements", group: "clients" },
  { to: "/advisors-admin/onboarding", label: "Onboarding", group: "clients" },
  { to: "/advisors-admin/billing", label: "Billing", group: "operations" },
  { to: "/advisors-admin/workspaces", label: "Workspaces", group: "operations" },
  { to: "/advisors-admin/documents", label: "Documents", group: "operations" },
  { to: "/advisors-admin/appointments", label: "Appointments", group: "operations" },
  { to: "/advisors-admin/staff", label: "Advisors", group: "admin" },
  { to: "/advisors-admin/settings/services-pricing", label: "Services & Pricing", group: "admin" },
] as const;

const ADVISOR_GROUPS = [
  { key: "workspace", label: "Overview" },
  { key: "pipeline", label: "Pipeline" },
  { key: "clients", label: "Clients" },
  { key: "operations", label: "Operations" },
  { key: "admin", label: "Administration" },
] as const;

export function AdvisorsSubnav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current =
    [...LINKS].reverse().find((link) => {
      const exact = "exact" in link && link.exact;
      return exact
        ? pathname === link.to || pathname === `${link.to}/`
        : pathname.startsWith(link.to);
    })?.to ?? "/advisors-admin";

  const sections = LINKS.map((link) => ({
    key: link.to,
    label: link.label,
    group: link.group,
  }));

  return (
    <GroupedModuleSubnav
      label="Advisors"
      groups={ADVISOR_GROUPS}
      sections={sections}
      current={current}
      renderSection={(section, active) => (
        <Link
          to={section.key}
          className={groupedModuleSectionClassName(active)}
          aria-current={active ? "page" : undefined}
        >
          {section.label}
        </Link>
      )}
    />
  );
}
