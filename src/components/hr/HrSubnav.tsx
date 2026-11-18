import { Link } from "@tanstack/react-router";
import {
  GroupedModuleSubnav,
  groupedModuleSectionClassName,
} from "@/components/common/GroupedModuleSubnav";
import { useCan } from "@/hooks/use-can";
import { HR_GROUPS } from "@/lib/hr/groups";
import { HR_SECTIONS, type HrSectionKey } from "@/lib/hr/sections";
import type { Permission } from "@/lib/permissions";

/**
 * Compact two-row HR navigation.
 *
 * Replaces the previous seven stacked group bands with Overview / People /
 * Recruitment / Time & Leave / Performance / Compensation / Reports /
 * Administration selectors while keeping every permitted section as a native Link.
 */
export function HrSubnav({ current }: { current: HrSectionKey }) {
  const { can } = useCan();
  const visible = HR_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <GroupedModuleSubnav
      label="HR"
      groups={HR_GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/hr"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        if (section.key === "overview") {
          return (
            <Link to="/hr" className={className} aria-current={active ? "page" : undefined}>
              {section.label}
            </Link>
          );
        }
        return (
          <Link
            to="/hr/$section"
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
