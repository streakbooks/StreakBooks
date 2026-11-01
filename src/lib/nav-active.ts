import { navItems, type NavItem } from "@/lib/nav";

/**
 * Current sidebar section from the actual URL, not the last clicked menu item.
 * A route belongs to a module only when the match ends on a path-segment boundary.
 * This works for direct links, browser back/forward, and nested record detail pages.
 */
export function activeNavItem(pathname: string, brandingOrigin?: unknown): NavItem | null {
  if (pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") === "/documents/branding")
    return (
      navItems.find(
        (item) => item.to === (brandingOrigin === "purchases" ? "/purchases" : "/sales"),
      ) ?? null
    );
  const raw = pathname.split(/[?#]/, 1)[0] || "/";
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
  if (path === "/") return navItems.find((item) => item.to === "/") ?? null;

  return (
    navItems
      .filter((item) => item.to !== "/" && (path === item.to || path.startsWith(item.to + "/")))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? null
  );
}

/** Sidebar selection and narrow-screen title always derive from the same route. */
export function activeNavLabel(pathname: string, brandingOrigin?: unknown): string {
  return activeNavItem(pathname, brandingOrigin)?.label ?? "LinkBooks";
}
