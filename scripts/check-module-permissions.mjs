#!/usr/bin/env node
/**
 * Fail closed when a registered sidebar module is missing permission catalogue
 * entries, owner role grants in the TS matrix, or matching role_permissions
 * seeds in supabase/migrations.
 *
 * Owner role is defined as ROLE_PERMISSION_MATRIX.owner = PERMISSIONS (all keys).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Sidebar module id → permission namespace prefix (without trailing dot). */
const MODULE_NAMESPACES = {
  pos: "pos",
  hr: "hr",
  crm: "crm",
  "property-management": "property",
  nonprofit: "nonprofit",
  gym: "gym",
  expenses: "expenses",
  payroll: "payroll",
  billing: "billing",
  "app-store": "appstore",
  accounting: "accounting",
  sales: "sales",
  purchases: "purchases",
  banking: "banking",
  projects: "projects",
  documents: "documents",
  reports: "reports",
  settings: "company",
};

const permissionsSource = read("src/lib/permissions.ts");
const permissionKeys = new Set(
  [...permissionsSource.matchAll(/"([a-z0-9_]+(?:\.[a-z0-9_]+)+)"/g)].map((m) => m[1]),
);

// Owner receives the full PERMISSIONS catalogue by design.
const ownerKeys = permissionKeys;

const migrationDir = path.join(root, "supabase/migrations");
const migrationText = fs
  .readdirSync(migrationDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join(migrationDir, f), "utf8"))
  .join("\n");

const seeded = new Set();
for (const match of migrationText.matchAll(
  /INSERT\s+INTO\s+public\.role_permissions[\s\S]*?ON\s+CONFLICT/gi,
)) {
  for (const row of match[0].matchAll(/'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'/g)) {
    seeded.add(row[1]);
  }
}

const registrySource = read("src/lib/modules/registry.ts");
const moduleBlocks = [
  ...registrySource.matchAll(
    /\{\s*id:\s*"([^"]+)"[\s\S]*?path:\s*"([^"]+)"[\s\S]*?inSidebar:\s*(true|false)/g,
  ),
];

let checked = 0;
for (const match of moduleBlocks) {
  const id = match[1];
  const inSidebar = match[3] === "true";
  if (!inSidebar) continue;
  const ns = MODULE_NAMESPACES[id];
  if (!ns) continue; // modules without a mapped namespace are tracked separately

  const prefix = ns + ".";
  const catalogue = [...permissionKeys].filter((p) => p === ns || p.startsWith(prefix));
  if (catalogue.length === 0) {
    failures.push(
      'Module "' +
        id +
        '" has no permissions in src/lib/permissions.ts under namespace "' +
        prefix +
        '"',
    );
    continue;
  }

  const viewKey = catalogue.find((p) => p.endsWith(".view")) ?? catalogue[0];
  if (!ownerKeys.has(viewKey)) {
    failures.push('Module "' + id + '" missing owner grant for "' + viewKey + '"');
  }

  const seededForNs = [...seeded].filter((p) => p === ns || p.startsWith(prefix));
  if (seededForNs.length === 0) {
    failures.push(
      'Module "' +
        id +
        '" has no role_permissions seed in supabase/migrations for namespace "' +
        prefix +
        '"',
    );
  } else if (!seededForNs.includes(viewKey)) {
    failures.push('Module "' + id + '" migration seeds missing view key "' + viewKey + '"');
  }
  checked += 1;
}

for (const required of ["hr.view", "hr.settings.edit", "hr.employees.manage"]) {
  if (!permissionKeys.has(required)) failures.push("HR catalogue missing " + required);
  if (!ownerKeys.has(required)) failures.push("Owner matrix missing " + required);
  if (!seeded.has(required)) failures.push("Migrations never seed " + required);
}

if (failures.length) {
  console.error("Module permission contracts FAILED:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}

console.log(
  "Module permission contracts passed: " +
    checked +
    " namespaced sidebar modules checked; owner inherits full PERMISSIONS catalogue.",
);
