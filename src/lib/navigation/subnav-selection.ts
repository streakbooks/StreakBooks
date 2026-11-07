export type SubnavDestination = {
  to: string;
  label: string;
  exact?: boolean;
  search?: Readonly<Record<string, string>>;
};

/**
 * Pick exactly one tab from a module's real path and query string. More-specific
 * routes win; same-path tabs with explicit search parameters win over generic tabs.
 * This is presentation only and never bypasses route/permission guards.
 */
export function activeSubnavIndex(
  items: readonly SubnavDestination[],
  pathname: string,
  search: Readonly<Record<string, unknown>> = {},
): number {
  const path = pathname.replace(/\/+$/, "") || "/";
  let bestIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const target = item.to.replace(/\/+$/, "") || "/";
    const pathMatches = item.exact
      ? path === target
      : path === target || path.startsWith(target === "/" ? "/" : target + "/");
    if (!pathMatches) continue;
    const required = Object.entries(item.search ?? {});
    if (!required.every(([key, value]) => search[key] === value)) continue;
    const score = target.length * 100 + required.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}
