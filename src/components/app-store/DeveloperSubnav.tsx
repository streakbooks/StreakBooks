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
      className="mb-3 flex min-w-0 flex-wrap gap-1 border-b border-border pb-2 print:hidden"
    >
      {visible.map((item) => {
        const active = current === item.key;
        const className = cn(
          "inline-flex h-8 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10",
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
