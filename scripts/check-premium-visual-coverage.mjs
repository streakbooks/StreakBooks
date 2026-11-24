/**
 * Route-inventory completeness guard for the original StreakBooks visual redesign.
 * This checks that all screens are tracked, NOT that they look good or pass browser tests.
 *
 * Run locally: npm run check:visual-coverage
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inventory = JSON.parse(
  readFileSync(join(root, "docs/ux/premium-visual-route-inventory.json"), "utf8"),
);
const nav = readFileSync(join(root, "src/lib/nav.ts"), "utf8");
const sidebar = [...nav.matchAll(/\{\s*label:\s*"([^"]+)",\s*to:\s*"([^"]+)",/g)].map((match) => ({
  label: match[1],
  href: match[2],
}));
const declaredSidebar = inventory.modules.map(({ label, href }) => ({ label, href }));

function scan(dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...scan(path));
    if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      result.push(relative(join(root, "src/routes"), path).split("\\").join("/"));
    }
  }
  return result;
}

function equalInventory(actual, expected, label) {
  const missing = expected.filter((item) => !actual.includes(item));
  const added = actual.filter((item) => !expected.includes(item));
  if (missing.length || added.length) {
    throw new Error(
      label +
        " inventory mismatch.\n" +
        (missing.length ? "Removed/renamed in repository: " + missing.join(", ") + "\n" : "") +
        (added.length ? "New untracked entries: " + added.join(", ") + "\n" : "") +
        "Update the premium visual route inventory before declaring any batch accepted.",
    );
  }
}

equalInventory(
  sidebar.map((item) => item.label + "|" + item.href),
  declaredSidebar.map((item) => item.label + "|" + item.href),
  "Sidebar modules",
);

const routes = scan(join(root, "src/routes")).sort();
const declared = [
  ...inventory.modules.flatMap((module) => module.routeFiles),
  ...inventory.supportingRoutes,
];
if (new Set(declared).size !== declared.length) {
  throw new Error("The premium visual inventory lists a route more than once");
}
equalInventory(routes, declared.sort(), "Application routes");

if (inventory.moduleAcceptance.length !== 12) {
  throw new Error("The visual acceptance criteria were changed without review");
}
for (const module of inventory.modules) {
  if (typeof module.verified !== "boolean" || !module.visualReview) {
    throw new Error("Module missing explicit visual verification state: " + module.label);
  }
  if (module.verified && !module.acceptanceEvidence) {
    throw new Error("A module cannot be complete without actual browser evidence: " + module.label);
  }
}
const complete = inventory.modules.filter((module) => module.verified).length;
console.log(
  "Premium visual coverage: " +
    sidebar.length +
    " modules and " +
    routes.length +
    " routes inventoried. " +
    complete +
    " fully verified modules.",
);
console.log(
  "Inventory guard passed. Browser quality, accounting integrity and deployment NOT established.",
);
