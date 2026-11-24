/**
 * Local-only release gate for the StreakBooks Tax branch.
 * This script never creates a GitHub Actions run, merges a PR, or touches
 * production Supabase. The default mode runs every locally reproducible gate.
 *
 * node scripts/verify-tax-release.mjs
 * node scripts/verify-tax-release.mjs --static-only
 * node scripts/verify-tax-release.mjs --staging
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!["--static-only", "--staging"].includes(arg)) {
    throw new Error("Unknown argument: " + arg);
  }
}
if (args.has("--static-only") && args.has("--staging")) {
  throw new Error("Choose one of --static-only or --staging.");
}
const migrationDir = path.join(root, "supabase", "migrations");
const migrationNames = readdirSync(migrationDir).filter((file) => /^\d{14}_.+\.sql$/.test(file));
const taxMigrations = [
  "20261107010000_tax_master_posted_history_guard.sql",
  "20261107011000_tax_gl_review_sessions.sql",
];
const oldConflictingName = "20261106120000_tax_master_posted_history_guard.sql";
if (migrationNames.includes(oldConflictingName)) {
  throw new Error("Old Tax migration collides with main: " + oldConflictingName);
}

const byVersion = new Map();
for (const filename of migrationNames) {
  const version = filename.slice(0, 14);
  byVersion.set(version, [...(byVersion.get(version) ?? []), filename]);
}
for (const filename of taxMigrations) {
  if (!migrationNames.includes(filename)) {
    throw new Error("Required Tax migration is missing: " + filename);
  }
  const version = filename.slice(0, 14);
  if ((byVersion.get(version) ?? []).length !== 1) {
    throw new Error(
      "Duplicate Tax migration version " + version + ": " + byVersion.get(version).join(", "),
    );
  }
}
if (taxMigrations[0].slice(0, 14) >= taxMigrations[1].slice(0, 14)) {
  throw new Error("Tax review migration must follow history protection.");
}
const baselineDuplicates = [...byVersion.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([version, files]) => version + " (" + files.join(", ") + ")");
if (baselineDuplicates.length) {
  console.warn(
    "Pre-existing migration collisions require separate repository review:",
    baselineDuplicates.join("; "),
  );
}
const sources = [
  ...taxMigrations.map((file) => path.join("supabase", "migrations", file)),
  "tests/integration/tax-master-posted-history.sql",
  "tests/integration/tax-extended-posted-sources.sql",
  "tests/integration/tax-gl-review-sessions.sql",
  "tests/integration/tax-schema-preflight.sql",
  "tests/integration/tax-legacy-tenant-preflight.sql",
  "tests/integration/tax-master-schema-postflight.sql",
  "tests/integration/tax-gl-review-schema-preflight.sql",
  "tests/integration/tax-gl-review-schema-postflight.sql",
];
for (const file of sources) {
  const fullPath = path.join(root, file);
  if (!existsSync(fullPath)) throw new Error("Missing Tax SQL source: " + file);
  const data = readFileSync(fullPath, "utf8");
  if ((data.match(/\$\$/g) ?? []).length % 2 !== 0 || /(?<!\$)\$(?!\$)/.test(data)) {
    throw new Error("Potential broken SQL dollar quoting: " + file);
  }
}
const runners = [
  ["scripts/test-tax-master-history-postgres.mjs", taxMigrations[0]],
  ["scripts/test-tax-gl-review-postgres.mjs", taxMigrations[1]],
];
for (const [file, migration] of runners) {
  const text = readFileSync(path.join(root, file), "utf8");
  if (!text.includes(migration)) {
    throw new Error(file + " must execute " + migration);
  }
}

console.log("PASS: Tax migration versions, ordering, sources and runner references");
if (args.has("--static-only")) {
  console.log("Static-only mode does not verify database, TypeScript or production readiness.");
  process.exit(0);
}

function step(label, binary, params) {
  console.log("\nRUN: " + label);
  const child = spawnSync(binary, params, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(label + " failed (exit " + child.status + "). Release blocked.");
  }
  console.log("PASS: " + label);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
step("TypeScript", npm, ["run", "typecheck"]);
step("ESLint", npm, ["run", "lint"]);
step("Tax unit tests", npm, ["test", "--", "src/lib/tax"]);
step("Tax posting and concurrency in isolated PostgreSQL", process.execPath, [
  "scripts/test-tax-master-history-postgres.mjs",
]);
step("Tax review RLS and audit in isolated PostgreSQL", process.execPath, [
  "scripts/test-tax-gl-review-postgres.mjs",
]);
step("Production build", npm, ["run", "build"]);

if (args.has("--staging")) {
  for (const name of [
    "E2E_BASE_URL",
    "E2E_EXPECTED_STAGING_HOST",
    "E2E_PRODUCTION_URL",
    "E2E_EMAIL",
    "E2E_PASSWORD",
  ]) {
    if (!process.env[name]) {
      throw new Error("Staging browser gate requires " + name);
    }
  }
  if (process.env.E2E_STAGING_ENABLED !== "true") {
    throw new Error("Set E2E_STAGING_ENABLED=true for explicitly authorised staging QA.");
  }
  step("Authenticated read-only Tax staging browser smoke", npm, [
    "run",
    "test:e2e",
    "--",
    "e2e/tax-release.staging.spec.ts",
  ]);
}
console.log("\nPASS: locally executable Tax release gates.");
console.log("Production release additionally requires reviewed staging migrations,");
console.log(
  "real posting-RPC integration, browser regression, approval and deployment verification.",
);
