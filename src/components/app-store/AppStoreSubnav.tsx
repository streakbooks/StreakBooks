import { Link } from "@tanstack/react-router";
import {
  GroupedModuleSubnav,
  groupedModuleSectionClassName,
} from "@/components/common/GroupedModuleSubnav";
import { useCan } from "@/hooks/use-can";
import { APP_STORE_SECTIONS, type AppStoreSectionKey } from "@/lib/app-store/sections";
import type { Permission } from "@/lib/permissions";

const APP_STORE_GROUPS = [
  { key: "discover", label: "Discover" },
  { key: "manage", label: "My apps" },
  { key: "operations", label: "Operations" },
  { key: "admin", label: "Administration" },
] as const;

export function AppStoreSubnav({ current }: { current: AppStoreSectionKey }) {
  const { can } = useCan();
  const visible = APP_STORE_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <GroupedModuleSubnav
      label="App Store"
      groups={APP_STORE_GROUPS}
      sections={visible}
      current={current}
      overview={
        visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/app-store"
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null
      }
      renderSection={(section, active) => {
        const className = groupedModuleSectionClassName(active);
        return section.key === "overview" ? (
          <Link to="/app-store" className={className} aria-current={active ? "page" : undefined}>
            {section.label}
          </Link>
        ) : (
          <Link
            to="/app-store/$section"
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
