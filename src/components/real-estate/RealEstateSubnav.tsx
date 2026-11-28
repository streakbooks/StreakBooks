import { Link } from "@tanstack/react-router";
import { GroupedModuleSubnav } from "@/components/common/GroupedModuleSubnav";
import { groupedModuleSectionClassName } from "@/lib/navigation/grouped-module-nav";
import { useCan } from "@/hooks/use-can";
import { RE_SECTIONS, type ReSectionKey } from "@/lib/real-estate/sections";
import type { Permission } from "@/lib/permissions";

const GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "inventory", label: "Projects and inventory" },
  { key: "sales", label: "Sales and collections" },
  { key: "delivery", label: "Commissions, costs and budgets" },
  { key: "admin", label: "Settings" },
] as const;

export function RealEstateSubnav({ current }: { current: ReSectionKey }) {
  const { can } = useCan();
  const visible = RE_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );
  return (
    <GroupedModuleSubnav
      label="Real Estate"
      groups={GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/real-estate"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link to="/real-estate" className={className} aria-current={active ? "page" : undefined}>
            {section.label}
          </Link>
        ) : (
          <Link
            to="/real-estate/$section"
            params={{ section: section.key }}
            search={{ project: "", unit: "", sale: "" }}
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
