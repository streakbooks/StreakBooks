import { Link } from "@tanstack/react-router";
import {
  GroupedModuleSubnav,
  groupedModuleSectionClassName,
} from "@/components/common/GroupedModuleSubnav";
import { useCan } from "@/hooks/use-can";
import { PM_SECTIONS, type PmSectionKey } from "@/lib/property-management/sections";
import type { Permission } from "@/lib/permissions";

const PM_GROUPS = [
  { key: "workspace", label: "Workspace" },
  { key: "portfolio", label: "Portfolio" },
  { key: "occupancy", label: "Occupancy" },
  { key: "money", label: "Money" },
  { key: "operations", label: "Operations" },
  { key: "settlement", label: "Settlement" },
  { key: "portals", label: "Portals" },
  { key: "insights", label: "Insights" },
  { key: "admin", label: "Administration" },
] as const;

/**
 * Compact two-row Property Management navigation via shared GroupedModuleSubnav.
 */
export function PmSubnav({ current }: { current: PmSectionKey }) {
  const { can } = useCan();
  const visible = PM_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <GroupedModuleSubnav
      label="Property Management"
      groups={PM_GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/property-management"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link
            to="/property-management"
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {section.label}
          </Link>
        ) : (
          <Link
            to="/property-management/$section"
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
