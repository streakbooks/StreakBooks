import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import type { SettingsDestination } from "@/lib/settings/module-navigation";
type Item = { to: string; label: string; exact?: boolean };
export function ModuleSubnav({
  label,
  items,
  settings,
}: {
  label: string;
  items: readonly Item[];
  settings: SettingsDestination;
}) {
  return (
    <nav
      aria-label={`${label} sections`}
      className="mb-6 flex min-w-0 items-stretch border-b border-border print:hidden"
    >
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {items
          .filter((i) => i.label !== "Settings")
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="-mb-px shrink-0 rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:py-3"
              activeProps={{ className: "border-primary text-foreground", "aria-current": "page" }}
            >
              {item.label}
            </Link>
          ))}
      </div>
      <SettingsDestinationLink
        destination={settings}
        ariaLabel={`${label} settings`}
        className="ml-2 inline-flex shrink-0 items-center gap-1.5 self-stretch rounded-t-md border-b-2 border-transparent bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Settings2 className="size-4" aria-hidden />
        Settings
      </SettingsDestinationLink>
    </nav>
  );
}
