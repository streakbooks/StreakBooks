import { SettingsSurface } from "@/components/settings/SettingsSurface";
import { parseSettingsPanel, panelLabel } from "@/lib/settings/panels";
import { WorkspaceSettingsShortcut } from "@/components/settings/ModuleSettingsLinks";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { LoadingState } from "@/components/common/states";
import {
  Link,
  useNavigate,
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Star,
  UserRound,
} from "lucide-react";
import { NAV_GROUPS, navItems, type NavItem } from "@/lib/nav";
import { activeNavItem, activeNavLabel } from "@/lib/nav-active";
import { buildBreadcrumbs } from "@/lib/breadcrumbs";
import { cn } from "@/lib/utils";
import { initialsFrom } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/use-active-company";
import { CompanySwitcher } from "@/components/layout/CompanySwitcher";
import { CalculatorPopover } from "@/components/layout/CalculatorPopover";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { MessagesBell } from "@/components/messaging/MessagesBell";
import { CreateNewMenu } from "@/components/create-new/CreateNewMenu";
import { AppLauncher } from "@/components/app-store/AppLauncher";
import { VoiceAssistant } from "@/components/ai-voice/VoiceAssistant";
import { VoiceProvider } from "@/components/ai-voice/VoiceProvider";
import { BillingAccessBanner } from "@/components/billing/BillingAccessBanner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PlatformAnnouncements } from "@/components/platform/PlatformAnnouncements";

const COLLAPSE_KEY = "streakbooks-sidebar-collapsed";
const InPlaceSettingsPanel = lazy(() =>
  import("@/components/settings/InPlaceSettingsPanel").then((module) => ({
    default: module.InPlaceSettingsPanel,
  })),
);

function UserMenu() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fullName = (user.user_metadata?.["full_name"] as string | undefined) ?? "";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
        >
          {initialsFrom(fullName, user.email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{fullName || "Your account"}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRound className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/platform" search={{ section: "overview" }}>
            <UserRound className="size-4" />
            Platform control centre
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="StreakBooks dashboard"
      className={cn(
        "flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "justify-center" : "px-1",
      )}
    >
      <img
        src={collapsed ? "/brand/streakbooks-mark.png" : "/brand/streakbooks-logo.png"}
        alt=""
        width={collapsed ? 36 : 148}
        height={collapsed ? 36 : 31}
        className={cn(
          "shrink-0 object-contain object-left",
          collapsed ? "size-9" : "h-8 w-[9.25rem] max-w-[min(100%,9.25rem)]",
        )}
      />
      {collapsed ? <span className="sr-only">StreakBooks</span> : null}
    </Link>
  );
}

/** A distinct StreakBooks workspace navigator: searchable, pin-able and route-aware.
 * All destinations remain native hyperlinks, including new-tab/middle-click support.
 */
function NavLink({
  item,
  collapsed,
  active,
  pinned,
  onNavigate,
  onTogglePin,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  pinned: boolean;
  onNavigate?: (() => void) | undefined;
  onTogglePin?: ((path: string) => void) | undefined;
}) {
  const link = (
    <Link
      to={item.to}
      {...(item.to === "/settings" ? { search: { section: "overview" } } : {})}
      onClick={(event: import("react").MouseEvent<HTMLElement>) => {
        // Modified clicks preserve the workspace and open another tab as normal.
        if (
          event.button === 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          onNavigate?.();
        }
      }}
      activeOptions={{ exact: item.to === "/" }}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      data-nav-group={item.group}
      {...(item.to === "/ai-assistant" ? { "data-nav-accent": "ai" } : {})}
      className={cn(
        "lb-nav-link group relative flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none pointer-coarse:min-h-11",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div className="group/nav flex items-center gap-1 rounded-lg">
      {link}
      {onTogglePin ? (
        <button
          type="button"
          onClick={() => onTogglePin(item.to)}
          aria-label={(pinned ? "Unpin " : "Pin ") + item.label}
          aria-pressed={pinned}
          title={pinned ? "Remove from favourites" : "Add to favourites"}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-md text-sidebar-foreground/65 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:size-11",
            pinned
              ? "text-sidebar-primary"
              : "opacity-70 lg:opacity-0 lg:group-hover/nav:opacity-100 lg:focus:opacity-100",
          )}
        >
          <Star className={cn("size-3.5", pinned && "fill-current")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

const NAV_PINS_KEY = "streakbooks.workspace.pins.v1";
const NAV_MAX_PINS = 8;

function readWorkspacePaths(key: string, max: number): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const paths = new Set(navItems.map((item) => item.to));
    return parsed
      .filter((path): path is string => typeof path === "string" && paths.has(path))
      .filter((path, index, items) => items.indexOf(path) === index)
      .slice(0, max);
  } catch {
    return [];
  }
}

function NavList({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brandingOrigin = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)["from"],
  });
  const activeTo = activeNavItem(pathname, brandingOrigin)?.to ?? null;
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);

  useEffect(() => {
    setPins(readWorkspacePaths(NAV_PINS_KEY, NAV_MAX_PINS));
  }, []);

  function togglePin(path: string) {
    setPins((previous) => {
      const updated = previous.includes(path)
        ? previous.filter((p) => p !== path)
        : [path, ...previous].slice(0, NAV_MAX_PINS);
      try {
        window.localStorage.setItem(NAV_PINS_KEY, JSON.stringify(updated));
      } catch {
        /* browser storage unavailable */
      }
      return updated;
    });
  }

  const search = query.trim().toLocaleLowerCase();
  const matches = (item: NavItem) =>
    !search || (item.label + " " + item.description).toLocaleLowerCase().includes(search);
  const main = NAV_GROUPS.filter((g) => g.id !== "footer");
  const footer = NAV_GROUPS.filter((g) => g.id === "footer");
  const byPath = (path: string) => navItems.find((item) => item.to === path);
  const shortcutItems = (paths: string[]) =>
    paths.map(byPath).filter((item): item is NavItem => Boolean(item && matches(item)));
  const makeLink = (item: NavItem) => (
    <NavLink
      key={item.to}
      item={item}
      collapsed={collapsed}
      active={item.to === activeTo}
      pinned={pins.includes(item.to)}
      onNavigate={onNavigate}
      onTogglePin={togglePin}
    />
  );
  const renderGroup = (g: (typeof NAV_GROUPS)[number], index: number) => {
    const items = navItems.filter(
      (n) =>
        n.group === g.id && matches(n) && (collapsed || !pins.includes(n.to) || Boolean(search)),
    );
    if (items.length === 0) return null;
    const headingId = "nav-group-" + g.id;
    const isClosed = !search && closedGroups.includes(g.id);
    return (
      <div
        key={g.id}
        role="group"
        {...(g.label ? { "aria-labelledby": headingId } : {})}
        className={cn(index > 0 && "mt-3")}
      >
        {g.label ? (
          collapsed ? (
            <div className="mx-3 mb-1.5 border-t border-sidebar-border" aria-hidden />
          ) : (
            <button
              id={headingId}
              type="button"
              aria-expanded={!isClosed}
              aria-controls={headingId + "-items"}
              onClick={() =>
                setClosedGroups((previous) =>
                  previous.includes(g.id)
                    ? previous.filter((id) => id !== g.id)
                    : [...previous, g.id],
                )
              }
              className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/65 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              {g.label}
              {isClosed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          )
        ) : null}
        <div
          id={headingId + "-items"}
          className={cn("space-y-0.5", isClosed && !collapsed && "hidden")}
        >
          {items.map(makeLink)}
        </div>
      </div>
    );
  };
  const pinnedItems = shortcutItems(pins);
  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        {!collapsed ? (
          <div className="mb-3 px-1">
            <label htmlFor={searchId} className="sr-only">
              Filter navigation
            </label>
            <div className="lb-nav-search flex items-center gap-2 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/40 px-3 transition-[border-color,box-shadow] focus-within:border-sidebar-ring/75 focus-within:ring-2 focus-within:ring-sidebar-ring/40">
              <Search className="size-4 shrink-0 text-sidebar-foreground/60" aria-hidden />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a workspace..."
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/55"
              />
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!collapsed && pinnedItems.length > 0 ? (
            <div role="group" aria-label="Favourites" className="mb-3">
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/65">
                Favourites
              </div>
              <div className="space-y-0.5">{pinnedItems.map(makeLink)}</div>
            </div>
          ) : null}
          {main.map(renderGroup)}
          {search && !navItems.some(matches) ? (
            <p role="status" className="px-3 py-4 text-sm text-sidebar-foreground/70">
              No matching workspace
            </p>
          ) : null}
        </div>
        <div className="mt-2 border-t border-sidebar-border pt-3">{footer.map(renderGroup)}</div>
      </nav>
    </TooltipProvider>
  );
}

function SidebarFooter({ isDemo, collapsed }: { isDemo: boolean; collapsed?: boolean }) {
  if (collapsed) return null;
  return (
    <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/70">
      {isDemo ? "Demo company · same posting engine as live books" : "Double-entry ledger enabled"}
    </div>
  );
}

/** Breadcrumb trail for the current route; ancestors link only when they are real routes. */
function Breadcrumbs() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brandingOrigin = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)["from"],
  });
  const settingsPanel = useRouterState({
    select: (s) =>
      parseSettingsPanel((s.location.search as Record<string, unknown>)["settingsPanel"]),
  });
  const ownerSection = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)["section"],
  });
  const baseCrumbs = buildBreadcrumbs(pathname, brandingOrigin);
  const crumbs = settingsPanel
    ? [
        ...baseCrumbs.map((c) => ({ ...c, current: false })),
        {
          label: panelLabel(
            settingsPanel,
            pathname.startsWith("/purchases")
              ? "purchases"
              : typeof ownerSection === "string"
                ? ownerSection
                : undefined,
          ),
          to: pathname + "?settingsPanel=" + settingsPanel,
          current: true,
        },
      ]
    : baseCrumbs;
  if (crumbs.length === 0) return null;
  const known = (path: string) =>
    Object.prototype.hasOwnProperty.call(router.routesByPath, path) ||
    Object.prototype.hasOwnProperty.call(router.routesByPath, `${path}/`);
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
            {!c.current && known(c.to) ? (
              <Link
                to={c.to}
                search={(previous: Record<string, unknown>) => {
                  const next = { ...previous };
                  delete next["settingsPanel"];
                  delete next["settingsTrail"];
                  return next;
                }}
                className="truncate rounded-sm hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn("truncate", c.current && "font-medium text-foreground")}
                {...(c.current ? { "aria-current": "page" as const } : {})}
              >
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return (
    <VoiceProvider userId={user.id}>
      <AppShellLayout>{children}</AppShellLayout>
    </VoiceProvider>
  );
}

function AppShellLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const settingsPanel = useRouterState({
    select: (s) =>
      parseSettingsPanel((s.location.search as Record<string, unknown>)["settingsPanel"]),
  });
  const { user } = useRouteContext({ from: "/_authenticated" });
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const { company, isPending } = useActiveCompany();
  const title = useRouterState({
    select: (s) =>
      activeNavLabel(s.location.pathname, (s.location.search as Record<string, unknown>)["from"]),
  });

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    // Announce a new page without stealing focus on filter/search updates.
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  // Read the saved sidebar state after mount so server and first client render agree.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  }

  const isDemo = Boolean(company?.is_demo);

  return (
    <div
      className="min-h-screen bg-background"
      style={
        {
          "--lb-sidebar-current-width": collapsed
            ? "var(--lb-sidebar-width-collapsed)"
            : "var(--lb-sidebar-width)",
        } as CSSProperties
      }
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside
        aria-label="Sidebar"
        className={cn(
          "lb-premium-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border/65 bg-sidebar transition-[width] duration-[var(--lb-duration-normal)] motion-reduce:transition-none print:hidden lg:flex",
          collapsed ? "w-[var(--lb-sidebar-width-collapsed)]" : "w-[var(--lb-sidebar-width)]",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 px-3",
            "h-[var(--lb-brand-bar-height)]",
            collapsed ? "flex-col justify-center gap-0.5" : "justify-between",
          )}
        >
          <Brand collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "hidden",
            )}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            aria-expanded={false}
            className="mx-auto mb-2 size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        ) : null}
        <CompanySwitcher collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <SidebarFooter isDemo={isDemo} collapsed={collapsed} />
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-[var(--lb-duration-normal)] motion-reduce:transition-none print:pl-0",
          collapsed
            ? "lg:pl-[var(--lb-sidebar-width-collapsed)]"
            : "lg:pl-[var(--lb-sidebar-width)]",
        )}
      >
        <header className="lb-workspace-topbar sticky top-0 z-30 flex min-h-[var(--lb-header-height)] flex-wrap items-center gap-1 border-b border-border/80 bg-card/95 px-3 py-2 print:hidden sm:flex-nowrap sm:gap-2 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="lb-premium-sidebar w-72 border-0 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="flex h-[var(--lb-brand-bar-height)] shrink-0 items-center px-4">
                  <Brand />
                </div>
                <CompanySwitcher />
                <NavList onNavigate={() => setOpen(false)} />
                <SidebarFooter isDemo={isDemo} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
            <div className="truncate text-sm font-semibold md:hidden">{title}</div>
            <div className="flex items-center gap-4">
              <Breadcrumbs />
              <GlobalSearch className="lg:ml-auto lg:max-w-sm" />
            </div>
          </div>

          <VoiceAssistant />
          <CalculatorPopover />
          <AppLauncher />
          <MessagesBell companyId={company?.id ?? null} />
          <NotificationBell companyId={company?.id ?? null} userId={user.id} />
          <CreateNewMenu />
          <ThemeToggle />
          <UserMenu />
        </header>

        <PlatformAnnouncements companyId={company?.id ?? null} />
        {company?.id ? <BillingAccessBanner companyId={company.id} /> : null}
        {!isPending && isDemo ? (
          <div
            role="status"
            className="border-b border-warning/30 bg-warning-soft px-4 py-2 print:hidden md:px-6"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="warning">Demo Company</Badge>
              <span className="text-foreground">
                Sample data · Your live organisations are separate.
              </span>
              <Link
                to="/settings"
                search={{ section: "demo" }}
                className="ml-auto rounded-sm text-sm font-medium underline underline-offset-4"
              >
                Manage demo
              </Link>
            </div>
          </div>
        ) : null}

        <main
          ref={mainRef}
          key={`${user.id}:${company?.id ?? ""}`}
          id="main-content"
          aria-label={title}
          tabIndex={-1}
          className={cn(
            "lb-workspace-canvas mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 outline-none md:px-7 md:py-8 xl:px-9 print:max-w-none print:p-0",
          )}
        >
          <SettingsSurface
            active={Boolean(settingsPanel && pathname !== "/settings")}
            detail={
              settingsPanel ? (
                <Suspense fallback={<LoadingState />}>
                  <InPlaceSettingsPanel panel={settingsPanel} />
                </Suspense>
              ) : null
            }
          >
            <WorkspaceSettingsShortcut pathname={pathname} />
            {children}
          </SettingsSurface>
        </main>
      </div>
    </div>
  );
}
