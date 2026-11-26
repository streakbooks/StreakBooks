#!/usr/bin/env node
/**
 * Permanent premium module inheritance checks (Section 20.3).
 * - Sidebar nav ↔ MODULE_REGISTRY
 * - Unique module ids
 * - Route tree coverage for registered module paths
 * - Forbidden ad-hoc status colour classes in new workspace/module code
 * - Inventory file presence for premium-ui docs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

// --- Docs presence (Wave 0 deliverables) ---
const requiredDocs = [
  "docs/premium-ui/ROUTE_AND_INTERACTION_INVENTORY.md",
  "docs/premium-ui/COMPETITOR_GAP_AND_ORIGINALITY_MATRIX.md",
  "docs/premium-ui/LINKBOOKS_DESIGN_SYSTEM.md",
  "docs/premium-ui/WORKSPACE_AND_WORKFLOW_SPEC.md",
  "docs/premium-ui/ACCEPTANCE_TRACEABILITY_MATRIX.md",
  "docs/premium-ui/LEGAL_ASSET_LICENSE_REGISTER.md",
  "docs/premium-ui/TEST_AND_VISUAL_QA_REPORT.md",
  "docs/premium-ui/SUPABASE_MIGRATION_AND_SECURITY_REGISTER.md",
  "docs/premium-ui/IMPLEMENTATION_BATCH_LEDGER.md",
  "docs/premium-ui/RELEASE_READINESS.md",
  "docs/premium-ui/FINISHED-SCREEN-DOD-CORE.md",
  "docs/engineering/NEW-MODULE-DEFINITION-OF-DONE.md",
];
for (const doc of requiredDocs) {
  if (!exists(doc)) failures.push(`Missing required artifact: ${doc}`);
}

// --- Parse MODULE_REGISTRY ids/paths from TypeScript source (no TS runtime needed) ---
const registrySource = read("src/lib/modules/registry.ts");
const moduleBlocks = [
  ...registrySource.matchAll(
    /\{\s*id:\s*"([^"]+)"[\s\S]*?path:\s*"([^"]+)"[\s\S]*?inSidebar:\s*(true|false)/g,
  ),
];
if (moduleBlocks.length < 24) {
  failures.push(`Expected at least 24 MODULE_REGISTRY entries, found ${moduleBlocks.length}`);
}

const ids = new Set();
const sidebar = [];
for (const match of moduleBlocks) {
  const id = match[1];
  const modulePath = match[2];
  const inSidebar = match[3] === "true";
  if (ids.has(id)) failures.push(`Duplicate module id: ${id}`);
  ids.add(id);
  if (inSidebar) sidebar.push({ id, path: modulePath });
}

const navSource = read("src/lib/nav.ts");
const navItemsBlock = navSource.match(/export const navItems(?::[^=]+)?=\s*\[([\s\S]*?)\];/);
if (!navItemsBlock) failures.push("Could not parse export const navItems from src/lib/nav.ts");
const navEntries = [
  ...(navItemsBlock?.[1].matchAll(/\{\s*label:\s*"([^"]+)"[\s\S]*?to:\s*"([^"]+)"/g) ?? []),
].map((m) => ({ label: m[1], to: m[2] }));
if (navEntries.length !== 29) {
  failures.push(`Expected 29 navItems, found ${navEntries.length}`);
}
if (sidebar.length !== navEntries.length) {
  failures.push(
    `Sidebar MODULE_REGISTRY count ${sidebar.length} !== navItems ${navEntries.length}`,
  );
}

// Match sidebar paths to nav (labels live separately; path is the durable key).
for (const item of navEntries) {
  if (!sidebar.some((entry) => entry.path === item.to)) {
    failures.push(`nav path missing from MODULE_REGISTRY sidebar: ${item.label} -> ${item.to}`);
  }
}

// --- Route tree contains registered sidebar destinations ---
const routeTree = exists("src/routeTree.gen.ts") ? read("src/routeTree.gen.ts") : "";
for (const entry of sidebar) {
  if (entry.path === "/") {
    if (!routeTree.includes('id: "/_authenticated/"') && !routeTree.includes('path: "/"')) {
      // Soft: index route always exists; only fail if route tree missing entirely.
      if (!routeTree) failures.push("src/routeTree.gen.ts missing");
    }
    continue;
  }
  const needle = entry.path.replace(/^\//, "");
  if (routeTree && !routeTree.includes(needle) && !routeTree.includes(entry.path)) {
    failures.push(`Registered module path not found in routeTree.gen.ts: ${entry.path}`);
  }
}

// --- Architecture: shared workspace primitives exist ---
for (const file of [
  "src/components/workspace/ListWorkspace.tsx",
  "src/components/workspace/RecordWorkspace.tsx",
  "src/lib/modules/types.ts",
  "src/lib/modules/registry.ts",
  "src/lib/modules/status-semantics.ts",
  "scripts/scaffold-module.mjs",
]) {
  if (!exists(file)) failures.push(`Missing premium architecture file: ${file}`);
}

// --- Forbidden raw status colour heuristics in workspace + modules libs ---
const scanRoots = ["src/components/workspace", "src/lib/modules"];
const forbidden = [
  /text-green-500/,
  /text-red-500/,
  /bg-green-500/,
  /bg-red-500/,
  /text-\[#(0f0|00ff00|f00|ff0000)\]/i,
];
function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) scan(file);
    else if (/\.(tsx?|jsx?)$/.test(item.name)) {
      const source = fs.readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          failures.push(`Forbidden ad-hoc status colour in ${path.relative(root, file)}`);
        }
      }
    }
  }
}
for (const rel of scanRoots) scan(path.join(root, rel));

// --- Scaffold script is executable contract ---
if (!exists("scripts/scaffold-module.mjs")) {
  failures.push("Missing scripts/scaffold-module.mjs");
} else {
  const scaffold = read("scripts/scaffold-module.mjs");
  for (const token of [
    "ListWorkspace",
    "fail-closed",
    "NEW-MODULE-DEFINITION-OF-DONE",
    "--dry-run",
  ]) {
    if (!scaffold.includes(token)) {
      failures.push(`scaffold-module.mjs missing required token: ${token}`);
    }
  }
}

// Route/screen modules must inherit via ListWorkspace/RecordWorkspace — not raw PageHeader.
const pageHeaderAllowlist = new Set([
  // None: authenticated screens/routes should compose shared workspaces.
]);
function scanPageHeaderBypass(dir, relativePrefix) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (item.isDirectory()) {
      scanPageHeaderBypass(file, relativePrefix);
      continue;
    }
    if (!file.endsWith(".tsx")) continue;
    if (pageHeaderAllowlist.has(rel)) continue;
    const source = fs.readFileSync(file, "utf8");
    const importsPageHeader =
      /import\s*\{[^}]*\bPageHeader\b[^}]*\}\s*from\s*["']@\/components\/common\/states["']/.test(
        source,
      ) || /import\s*\{[^}]*\bPageHeader\b[^}]*\}\s*from\s*["']\.\.\/.*states["']/.test(source);
    if (importsPageHeader) {
      failures.push(
        `${rel} imports PageHeader directly; use ListWorkspace/RecordWorkspace for premium inheritance`,
      );
    }
  }
}
scanPageHeaderBypass(path.join(root, "src", "screens"), "src/screens");
scanPageHeaderBypass(path.join(root, "src", "routes"), "src/routes");

if (failures.length) {
  for (const reason of failures) process.stderr.write(`FAIL ${reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Module contracts passed: ${ids.size} modules, ${sidebar.length} sidebar, ${requiredDocs.length} docs.\n`,
  );
}
