/**
 * Sync docs/ux/all-module-browsing-manifest.json to current nav + authenticated routes.
 * Inventory only — never marks modules fullyVerified.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(root, "docs/ux/all-module-browsing-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const nav = readFileSync(join(root, "src/lib/nav.ts"), "utf8");
const sidebar = [...nav.matchAll(/\{\s*label:\s*"([^"]+)",\s*to:\s*"([^"]+)",/g)].map((m) => ({
  label: m[1],
  href: m[2],
}));

function listRoutes(dir) {
  const out = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, item.name);
    if (item.isDirectory()) out.push(...listRoutes(target));
    else if (/\.(?:ts|tsx)$/.test(item.name)) {
      out.push(relative(join(root, "src/routes/_authenticated"), target).split("\\").join("/"));
    }
  }
  return out.sort();
}

const actualRoutes = listRoutes(join(root, "src/routes/_authenticated"));
const supporting = new Set(manifest.supportingRoutes);
const moduleRoutes = actualRoutes.filter((r) => !supporting.has(r));

function prefixForHref(href) {
  if (href === "/") return null;
  return href.replace(/^\//, "");
}

const byHref = new Map(manifest.modules.map((m) => [m.href, m]));
const nextModules = sidebar.map((entry) => {
  const existing = byHref.get(entry.href);
  const prefix = prefixForHref(entry.href);
  let routeFiles = [];
  if (entry.href === "/") {
    routeFiles = moduleRoutes.filter((r) => r === "index.tsx");
  } else if (prefix) {
    routeFiles = moduleRoutes.filter(
      (r) => r === `${prefix}.tsx` || r.startsWith(`${prefix}/`) || r.startsWith(`${prefix}.`),
    );
  }
  // Purchases also owns legacy expense-management nested under purchases/
  if (entry.href === "/purchases") {
    const extra = moduleRoutes.filter(
      (r) => r.startsWith("purchases/") || r === "purchases.tsx" || r.startsWith("purchases."),
    );
    routeFiles = [...new Set([...routeFiles, ...extra])].sort();
  }
  return {
    label: entry.label,
    href: entry.href,
    routeFiles: routeFiles.sort(),
    browsingImplementation: existing?.browsingImplementation ?? "partial_code_not_runtime_verified",
    fullyVerified: false,
    ...(existing?.currentEvidence ? { currentEvidence: existing.currentEvidence } : {}),
    ...(existing?.remaining
      ? { remaining: existing.remaining }
      : {
          remaining: [
            "Verify native navigation, deep links, refresh, Back/Forward and contextual return",
            "Verify real actions, permissions, accessibility and accounting integrity where applicable",
            "Run authenticated browser, unit and coverage acceptance suites",
          ],
        }),
    ...(existing?.tests ? { tests: existing.tests } : { tests: "NOT RUN" }),
  };
});

// Ensure every non-supporting route appears exactly once
const assigned = new Set(nextModules.flatMap((m) => m.routeFiles));
const unassigned = moduleRoutes.filter((r) => !assigned.has(r));
if (unassigned.length) {
  // Attach leftovers to Dashboard as last resort only if truly unmatched — fail loudly instead.
  throw new Error(
    "Unassigned authenticated routes after module prefix mapping:\n" + unassigned.join("\n"),
  );
}

manifest.modules = nextModules;
manifest.counts = {
  sidebarModules: nextModules.length,
  authenticatedRouteFiles: actualRoutes.length,
  supportingRouteFiles: manifest.supportingRoutes.length,
};
manifest.source = {
  ...manifest.source,
  syncedAt: new Date().toISOString().slice(0, 10),
  navigationSource: "src/lib/nav.ts",
  routeRoot: "src/routes/_authenticated/",
  note: "Inventory sync only. fullyVerified remains false until DoD evidence exists.",
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Synced browsing manifest: ${nextModules.length} modules, ${actualRoutes.length} routes, ${manifest.supportingRoutes.length} supporting.`,
);
