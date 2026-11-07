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
compareList(
  parsedSidebar.map((m) => m.label + " | " + m.href),
  sidebar.map((m) => m.label + " | " + m.href),
  "Top-level sidebar modules",
);

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
if (new Set(manifest.acceptanceCriteria).size !== manifest.acceptanceCriteria.length) {
  throw new Error("Browsing acceptance criteria must be unique");
}
for (const module of manifest.modules) {
  if (module.fullyVerified && (!Array.isArray(module.verificationEvidence) || module.verificationEvidence.length !== 12 || module.verificationEvidence.some((entry) => typeof entry !== "string" || !entry.trim()))) {
    throw new Error("Fully verified module requires 12 nonempty acceptance evidence entries: " + module.label);
  }
}

const missingRequirements = manifest.modules.filter(
  (module) =>
    !module.browsingImplementation ||
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
