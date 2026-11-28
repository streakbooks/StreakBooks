import { Link } from "@tanstack/react-router";
import { GroupedModuleSubnav } from "@/components/common/GroupedModuleSubnav";
import { groupedModuleSectionClassName } from "@/lib/navigation/grouped-module-nav";
import { useCan } from "@/hooks/use-can";
import { GYM_SECTIONS, type GymSectionKey } from "@/lib/gym/sections";
import type { Permission } from "@/lib/permissions";

const GYM_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "members", label: "Members and memberships" },
  { key: "scheduling", label: "Scheduling and operations" },
  { key: "finance", label: "Financial management" },
  { key: "business", label: "Business management" },
] as const;

export function GymSubnav({ current }: { current: GymSectionKey }) {
  const { can } = useCan();
  const visible = GYM_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );
  return (
    <GroupedModuleSubnav
      label="Gym & Fitness"
      groups={GYM_GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/gym"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Dashboard
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link to="/gym" className={className} aria-current={active ? "page" : undefined}>
            {section.label}
          </Link>
        ) : (
          <Link
            to="/gym/$section"
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
