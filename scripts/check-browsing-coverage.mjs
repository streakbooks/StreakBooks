/**
 * Prevent new LinkBooks modules or authenticated routes from disappearing from
 * the premium browsing release inventory.
 *
 * Run locally: npm run check:browsing-coverage
 * This audits inventory presence only. It never claims that an included route
 * is fully functional, accessible, secure, tested or production-ready.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isCanonicalRoutePath } from "./lib/browsing-route-path.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "docs/ux/all-module-browsing-manifest.json"), "utf8"),
);
const navSource = readFileSync(join(root, "src/lib/nav.ts"), "utf8");

function listRoutes(directory) {
  const paths = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, item.name);
    if (item.isDirectory()) {
      paths.push(...listRoutes(target));
    } else if (item.isFile() && /\.(?:ts|tsx)$/.test(item.name)) {
      paths.push(relative(join(root, "src/routes/_authenticated"), target).split("\\").join("/"));
    }
  }
  return paths.sort();
}

function compareList(expected, actual, name) {
  const missing = expected.filter((x) => !actual.includes(x));
  const added = actual.filter((x) => !expected.includes(x));
  if (missing.length || added.length) {
    throw new Error(
      name + " is out of sync.\n" +
      (missing.length ? "Missing from repository: " + missing.join(", ") + "\n" : "") +
      (added.length ? "Missing from manifest: " + added.join(", ") + "\n" : "") +
      "Update the all-module browsing manifest and specify its browsing acceptance criteria.",
    );
  }
}

const parsedSidebar = [...navSource.matchAll(
  /\{\s*label:\s*"([^"]+)",\s*to:\s*"([^"]+)",/g,
)].map((match) => ({ label: match[1], href: match[2] }));
const sidebar = manifest.modules.map(({ label, href }) => ({ label, href }));
// A set-based inventory comparison alone cannot detect duplicate sidebar
// declarations. Reject duplicates in both the source navigation and manifest.
for (const [name, entries] of [["Source navigation", parsedSidebar], ["Browsing manifest", sidebar]]) {
  const keys = entries.map(({ label, href }) => label + " | " + href);
  if (new Set(keys).size !== keys.length) {
    throw new Error(name + " contains duplicate top-level sidebar entries");
  }
}
if (sidebar.some(({ label, href }) => typeof label !== "string" || !label.trim() || typeof href !== "string" || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(href))) {
  throw new Error("Browsing manifest contains invalid top-level sidebar entries");
}
// A shared destination under different sidebar labels can conceal an omitted
// workspace. Require explicit unique navigation targets, not just unique pairs.
for (const [name, entries] of [["Source navigation", parsedSidebar], ["Browsing manifest", sidebar]]) {
  const targets = entries.map((entry) => entry.href);
  if (new Set(targets).size !== targets.length) {
    throw new Error(name + " contains duplicate sidebar destinations");
  }
  // Distinct URLs cannot justify duplicate visible module labels. Normalize
  // whitespace and case so a future navigation addition cannot hide in the
  // inventory under a visually identical label.
  const labels = entries.map((entry) => entry.label.trim().replace(/\\s+/g, " ").toLocaleLowerCase("en"));
  if (new Set(labels).size !== labels.length) {
    throw new Error(name + " contains duplicate normalized sidebar labels");
  }
}
compareList(
  parsedSidebar.map((m) => m.label + " | " + m.href),
  sidebar.map((m) => m.label + " | " + m.href),
  "Top-level sidebar modules",
);

// Each module must own at least one unique authenticated route. A duplicate
// module route would otherwise be hidden by the global inventory comparison.
for (const module of manifest.modules) {
  if (!Array.isArray(module.routeFiles) || module.routeFiles.length === 0) {
    throw new Error("Browsing module requires at least one route: " + module.label);
  }
  if (module.routeFiles.some((route) => !isCanonicalRoutePath(route))) {
    throw new Error("Browsing module contains a noncanonical route: " + module.label);
  }
  if (new Set(module.routeFiles).size !== module.routeFiles.length) {
    throw new Error("Browsing module contains duplicate routes: " + module.label);
  }
}
if (!Array.isArray(manifest.supportingRoutes) ||
    manifest.supportingRoutes.some((route) => !isCanonicalRoutePath(route))) {
  throw new Error("Supporting route inventory must contain canonical route paths");
}

// Both module and supporting routes are validated with the same shared
// canonical-path predicate above; do not introduce a divergent regex here.

const actualRoutes = listRoutes(join(root, "src/routes/_authenticated"));
const declaredRoutes = [
  ...manifest.modules.flatMap((module) => module.routeFiles),
  ...manifest.supportingRoutes,
];
if (new Set(declaredRoutes).size !== declaredRoutes.length) {
  throw new Error("Duplicate authenticated routes found in browsing manifest");
}
compareList(actualRoutes, declaredRoutes, "Authenticated route files");

// Detect stale summary totals as well as missing route entries. These totals are
// informational only, and must never be interpreted as acceptance-test results.
const expectedCounts = {
  sidebarModules: sidebar.length,
  authenticatedRouteFiles: actualRoutes.length,
  supportingRouteFiles: manifest.supportingRoutes.length,
};
for (const [key, actual] of Object.entries(expectedCounts)) {
  if (manifest.counts?.[key] !== actual) {
    throw new Error(`Browsing manifest counts.${key} is ${manifest.counts?.[key]}; expected ${actual}. Update the coverage inventory.`);
  }
}
if (!Array.isArray(manifest.acceptanceCriteria) || manifest.acceptanceCriteria.length !== 12 || manifest.acceptanceCriteria.some((criterion) => typeof criterion !== "string" || !criterion.trim())) {
  throw new Error("Exactly 12 nonempty browsing acceptance criteria are required");
}
if (new Set(manifest.acceptanceCriteria.map((criterion) => criterion.trim())).size !== manifest.acceptanceCriteria.length) {
  throw new Error("Browsing acceptance criteria must be unique");
}
// A checked-off criterion cannot be backed by placeholder or unexecuted evidence.
// This is a documentation integrity check, not a substitute for executing tests.
function hasExecutableAcceptanceEvidence(entry) {
  if (!Array.isArray(entry.verificationEvidence) || entry.verificationEvidence.length !== 12) {
    return false;
  }
  const evidence = entry.verificationEvidence;
  return evidence.every((value) =>
    typeof value === "string" && value.trim().length > 0 &&
    !/\b(?:NOT RUN|PENDING|TODO|TBD|UNVERIFIED|NOT VERIFIED|NOT TESTED|SOURCE ONLY|SOURCE REVIEW ONLY|PLACEHOLDER)\b/i.test(value)
  ) && new Set(evidence.map((value) => value.trim())).size === 12;
}

for (const module of manifest.modules) {
  if (module.fullyVerified === true && !hasExecutableAcceptanceEvidence(module)) {
    throw new Error("Fully verified module requires 12 nonempty acceptance evidence entries: " + module.label);
  }
}

// Every supporting route must have an explicit status entry, not merely appear
// in the route inventory. This prevents hidden workflows from silently escaping
// the per-route browsing acceptance review.
const supportingEvidence = manifest.supportingRouteEvidence;
if (!supportingEvidence || typeof supportingEvidence !== "object" || Array.isArray(supportingEvidence)) {
  throw new Error("Supporting-route browsing evidence register is required");
}
for (const route of manifest.supportingRoutes) {
  const entry = supportingEvidence[route];
  if (!entry || typeof entry.status !== "string" || !entry.status.trim() || typeof entry.fullyVerified !== "boolean") {
    throw new Error("Supporting route requires explicit status and fullyVerified flag: " + route);
  }
}

// Supporting routes and cross-cutting workflows are first-class coverage areas.
// A verified status cannot be asserted without evidence for every criterion.
for (const [route, entry] of Object.entries(manifest.supportingRouteEvidence ?? {})) {
  if (!manifest.supportingRoutes.includes(route)) {
    throw new Error("Supporting-route evidence refers to an unknown route: " + route);
  }
  if (entry.fullyVerified === true && !hasExecutableAcceptanceEvidence(entry)) {
    throw new Error("Verified supporting route requires 12 nonempty acceptance evidence entries: " + route);
  }
}
if (!Array.isArray(manifest.crossCutting) || manifest.crossCutting.some((entry) => !entry || typeof entry.area !== "string" || !entry.area.trim() || typeof entry.status !== "string" || !entry.status.trim() || typeof entry.fullyVerified !== "boolean")) {
  throw new Error("Cross-cutting browsing areas require a name, status and explicit fullyVerified boolean");
}
if (new Set(manifest.crossCutting.map((entry) => entry.area.trim())).size !== manifest.crossCutting.length) {
  throw new Error("Duplicate cross-cutting browsing areas");
}
for (const entry of manifest.crossCutting) {
  if (entry.fullyVerified === true && !hasExecutableAcceptanceEvidence(entry)) {
    throw new Error("Verified cross-cutting workflow requires 12 nonempty acceptance evidence entries: " + entry.area);
  }
}

const missingRequirements = manifest.modules.filter(
  (module) =>
    typeof module.browsingImplementation !== "string" || !module.browsingImplementation.trim() ||
    typeof module.fullyVerified !== "boolean" ||
    !Array.isArray(module.routeFiles),
);
if (missingRequirements.length) {
  throw new Error("Module coverage status missing for: " +
    missingRequirements.map((m) => m.label).join(", "));
}
for (const module of manifest.modules) {
  if (module.fullyVerified === true && !module.verificationEvidence) {
    throw new Error("No verifiable acceptance evidence for: " + module.label);
  }
}
if (!Array.isArray(manifest.acceptanceCriteria) ||
    manifest.acceptanceCriteria.length !== 12) {
  throw new Error("Every module must be reviewed against the 12 browsing acceptance criteria");
}

const awaiting = manifest.modules.filter((m) => !m.fullyVerified);
console.log(
  "LinkBooks browsing inventory: " +
  manifest.modules.length + " sidebar modules, " +
  actualRoutes.length + " authenticated routes, " +
  manifest.supportingRoutes.length + " supporting routes.",
);
console.log(
  "Fully verified modules: " + (manifest.modules.length - awaiting.length) +
  ". Not yet fully verified: " + awaiting.length + ".",
);
console.log("Inventory coverage verified; runtime functionality NOT established by this check.");
