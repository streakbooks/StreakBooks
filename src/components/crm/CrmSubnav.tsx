import { Link } from "@tanstack/react-router";
import {
  GroupedModuleSubnav,
  groupedModuleSectionClassName,
} from "@/components/common/GroupedModuleSubnav";
import { useCan } from "@/hooks/use-can";
import { CRM_SECTIONS, type CrmSectionKey } from "@/lib/crm/sections";
import type { Permission } from "@/lib/permissions";

const CRM_GROUPS = [
  { key: "workspace", label: "Workspace" },
  { key: "pipeline", label: "Pipeline" },
  { key: "relationships", label: "Relationships" },
  { key: "engagement", label: "Engagement" },
  { key: "revenue", label: "Revenue" },
  { key: "insights", label: "Insights" },
  { key: "admin", label: "Administration" },
] as const;

/**
 * Compact two-row CRM navigation via shared GroupedModuleSubnav.
 */
export function CrmSubnav({ current }: { current: CrmSectionKey }) {
  const { can } = useCan();
  const visible = CRM_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <GroupedModuleSubnav
      label="CRM"
      groups={CRM_GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/crm"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link to="/crm" className={className} aria-current={active ? "page" : undefined}>
            {section.label}
          </Link>
        ) : (
          <Link
            to="/crm/$section"
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
