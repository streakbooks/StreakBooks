import { Link } from "@tanstack/react-router";
import { GroupedModuleSubnav } from "@/components/common/GroupedModuleSubnav";
import { groupedModuleSectionClassName } from "@/lib/navigation/grouped-module-nav";
import { useCan } from "@/hooks/use-can";
import { NP_SECTIONS, type NpSectionKey } from "@/lib/nonprofit/sections";
import { organisationTerms } from "@/lib/nonprofit/terminology";
import type { Permission } from "@/lib/permissions";

const NP_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "funds", label: "Funds and accounting" },
  { key: "giving", label: "Donors and donations" },
  { key: "grants", label: "Grants" },
  { key: "fundraising", label: "Fundraising" },
  { key: "programmes", label: "Programmes" },
  { key: "finance", label: "Financial operations" },
  { key: "people", label: "People and governance" },
  { key: "reports", label: "Reports" },
  { key: "portals", label: "Portals" },
  { key: "admin", label: "Settings" },
] as const;

export function NonprofitSubnav({
  current,
  kind,
}: {
  current: NpSectionKey;
  kind?: string | null;
}) {
  const { can } = useCan();
  const terms = organisationTerms(kind);
  const visible = NP_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  ).map((section) => ({ ...section, label: terms.sections[section.key] }));
  const groups = NP_GROUPS.map((group) => ({
    ...group,
    label: terms.groups[group.key] ?? group.label,
  }));
  return (
    <GroupedModuleSubnav
      label="Nonprofit"
      groups={groups}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/nonprofit"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Dashboard
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link to="/nonprofit" className={className} aria-current={active ? "page" : undefined}>
            {section.label}
          </Link>
        ) : (
          <Link
            to="/nonprofit/$section"
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
