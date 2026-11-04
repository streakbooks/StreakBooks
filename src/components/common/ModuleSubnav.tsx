import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Settings2 } from "lucide-react";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import type { SettingsDestination } from "@/lib/settings/module-navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  exact?: boolean;
  search?: Record<string, string>;
  count?: number | undefined;
};

/** Shared module navigation. Less frequent destinations stay addressable native links. */
export function ModuleSubnav({
  label,
  items,
  settings,
}: {
  label: string;
  items: readonly Item[];
  settings: SettingsDestination;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const destinations = items.filter((item) => item.label !== "Settings");
  const primary = destinations.slice(0, 5);
  const secondary = destinations.slice(5);
  const isActive = (item: Item) =>
    item.exact
      ? pathname === item.to || pathname === `${item.to}/`
      : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const activeSecondary = secondary.find(isActive);
  return (
    <nav
      aria-label={`${label} sections`}
      className="mb-6 flex min-w-0 items-center gap-1 border-b border-border pb-2 print:hidden"
    >
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain py-1">
        {primary.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            search={item.search as never}
            activeOptions={{ exact: item.exact ?? false }}
            aria-current={isActive(item) ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11",
              isActive(item) && "bg-accent text-accent-foreground",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {item.count}
              </Badge>
            ) : null}
          </Link>
        ))}
      </div>
      {secondary.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={activeSecondary ? "secondary" : "ghost"}
              size="sm"
              aria-label={`More ${label.toLowerCase()} sections${activeSecondary ? `: ${activeSecondary.label}` : ""}`}
            >
              <span className="hidden max-w-44 truncate sm:inline">
                {activeSecondary?.label ?? "More"}
              </span>
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {secondary.map((item) => (
              <DropdownMenuItem key={item.to} asChild>
                <Link
                  to={item.to}
                  search={item.search as never}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(isActive(item) && "bg-accent font-medium")}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <SettingsDestinationLink
        destination={settings}
        mode="route"
        ariaLabel={`${label} settings`}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <Settings2 className="size-4" aria-hidden />
        <span className="hidden sm:inline">Settings</span>
      </SettingsDestinationLink>
    </nav>
  );
}
