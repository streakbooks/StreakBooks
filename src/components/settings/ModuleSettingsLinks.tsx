import { panelForDestination, openSettingsPanel } from "@/lib/settings/panels";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Settings2 } from "lucide-react";
import {
  MODULE_SETTINGS_LINKS,
  workspaceSettingsFor,
  type SettingsDestination,
} from "@/lib/settings/module-navigation";
import type { SettingsCategory } from "@/lib/settings/registry";
import {
  settingsRouteForLegacyPath,
  settingsRouteForPanel,
  settingsRouteForSection,
} from "@/lib/settings/route-model";
import { currentSettingsReturnTo, validateSettingsReturnTo } from "@/lib/settings/return-context";
export function SettingsDestinationLink({
  destination,
  children,
  className,
  ariaLabel,
  mode = "route",
}: {
  destination: SettingsDestination;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  mode?: "panel" | "route";
}) {
  const location = useRouterState({ select: (s) => s.location });
  const currentSearch = location.search as Record<string, unknown>;
  const returnTo =
    validateSettingsReturnTo(currentSearch["returnTo"]) ??
    currentSettingsReturnTo(location.pathname);
  const panel = mode === "panel" ? panelForDestination(destination) : undefined;
  const canonicalRoute =
    mode === "route"
      ? ((destination.panel ? settingsRouteForPanel(destination.panel) : undefined) ??
        (destination.section ? settingsRouteForSection(destination.section) : undefined) ??
        settingsRouteForLegacyPath(destination.to))
      : undefined;
  return (
    <Link
      to={canonicalRoute ? "/settings/$group/$page" : panel ? location.pathname : destination.to}
      {...(canonicalRoute ? { params: canonicalRoute } : {})}
      search={
        canonicalRoute
          ? {
              section: "overview",
              ...(returnTo ? { returnTo } : {}),
            }
          : panel
            ? (previous: Record<string, unknown>) => openSettingsPanel(previous, panel)
            : destination.section
              ? { section: destination.section }
              : destination.from
                ? { from: destination.from }
                : {}
      }
      className={className}
      aria-label={ariaLabel}
      activeOptions={{ exact: true }}
      activeProps={{ className: "border-primary text-primary", "aria-current": "page" }}
    >
      {children}
    </Link>
  );
}
export function ModuleSettingsLinks({
  category,
  central = false,
}: {
  category: SettingsCategory;
  central?: boolean;
}) {
  const links = MODULE_SETTINGS_LINKS[category];
  if (!links?.length) return null;
  const visible = central
    ? links.filter((l) => !(l.to === "/settings" && l.section === category))
    : links;
  return (
    <section aria-label={`Related ${category} settings`} className="mb-6 space-y-3">
      <h2 className="text-base font-semibold">{central ? "Quick access" : "Related settings"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((link) => (
          <SettingsDestinationLink
            key={link.label}
            destination={link}
            className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{link.label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{link.description}</span>
            </span>
            <ChevronRight
              className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
              aria-hidden
            />
          </SettingsDestinationLink>
        ))}
      </div>
    </section>
  );
}
export function WorkspaceSettingsShortcut({ pathname }: { pathname: string }) {
  const module = workspaceSettingsFor(pathname);
  if (
    !module ||
    module.pinned ||
    (module.rootHasSettingsLink && pathname.replace(/\/$/, "") === module.prefix) ||
    pathname.replace(/\/$/, "") === module.destination.to
  )
    return null;
  return (
    <div className="mb-3 flex justify-end print:hidden">
      <SettingsDestinationLink
        destination={module.destination}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Settings2 className="size-4" aria-hidden />
        {module.label}
      </SettingsDestinationLink>
    </div>
  );
}
