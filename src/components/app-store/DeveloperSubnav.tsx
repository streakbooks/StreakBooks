import { Link } from "@tanstack/react-router";
import { useCan } from "@/hooks/use-can";
import {
  DEVELOPER_PORTAL_SECTIONS,
  type DeveloperPortalSectionKey,
} from "@/lib/app-store/sections";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function DeveloperSubnav({ current }: { current: DeveloperPortalSectionKey }) {
  const { can } = useCan();
  const visible = DEVELOPER_PORTAL_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  return (
    <nav
      aria-label="Developer portal sections"
      className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {visible.map((item) => {
        const active = current === item.key;
        const className = cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );
        if (item.key === "dashboard") {
          return (
            <Link
              key={item.key}
              to="/developer"
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <Link
            key={item.key}
            to="/developer/$section"
            params={{ section: item.key }}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
