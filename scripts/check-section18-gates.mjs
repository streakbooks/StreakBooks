#!/usr/bin/env node
/**
 * Honest Section 18 gate reporter. Never claims go-live from chrome alone.
 * Exit 0 with a status table by default. Pass --require-go-live to fail when
 * any blocker remains (used only when explicitly requesting a go-live claim).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requireGoLive = process.argv.includes("--require-go-live");

function envSet(name) {
  const value = process.env[name];
  return Boolean(value && String(value).trim());
}

function fileExists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const stagingConfigured =
  process.env.E2E_STAGING_ENABLED === "true" &&
  envSet("E2E_EMAIL") &&
  envSet("E2E_PASSWORD") &&
  envSet("E2E_BASE_URL") &&
  envSet("E2E_EXPECTED_STAGING_HOST");

const gates = [
  {
    id: "local-chrome-gates",
    label: "Local chrome/honesty gates (modules/workspace/empty/error-retry)",
    status: "PASS",
    detail: "Enforced by npm run check:modules",
  },
  {
    id: "program-authorization",
    label: "Program / production authorization",
    status: "PASS",
    detail: "Granted 2026-11-07 by product owner",
  },
  {
    id: "production-deploy",
    label: "Production deployment present",
    status: "PASS",
    detail: "Vercel alias recorded in RELEASE_READINESS.md",
  },
  {
    id: "staging-e2e",
    label: "Authenticated staging E2E",
    status: stagingConfigured ? "READY" : "BLOCKED",
    detail: stagingConfigured
      ? "E2E_* staging credentials are configured"
      : "E2E_STAGING_ENABLED + E2E_EMAIL/PASSWORD/BASE_URL/EXPECTED_STAGING_HOST unset",
  },
  {
    id: "live-rbac",
    label: "Live/staging two-tenant RBAC re-proof",
    status: "BLOCKED",
    detail: "Unit deny-path only (assertCompany*, demo, globalSearch); live campaign not run",
  },
  {
    id: "manual-a11y",
    label: "Manual SR / zoom / contrast on core modules",
    status: "BLOCKED",
    detail: "Fixture axe exists; manual SR/zoom still required",
  },
  {
    id: "accounting-invariants",
    label: "Accounting invariant campaign on staging/prod tenants",
    status: "PARTIAL",
    detail: "Local unit evidence (journal-line-review, posted-gl-evidence, payroll/FA audits)",
  },
  {
    id: "migration-rollback",
    label: "Prod migration rollback plan when schema changes",
    status: fileExists("docs/premium-ui/SUPABASE_MIGRATION_AND_SECURITY_REGISTER.md")
      ? "PASS"
      : "BLOCKED",
    detail: "Chrome batches have no schema; register documents required steps",
  },
  {
    id: "external-integrations",
    label: "External integration sandbox validation",
    status: "BLOCKED",
    detail: "Only where claimed integrations are asserted live",
  },
];

const blocked = gates.filter((g) => g.status === "BLOCKED" || g.status === "PARTIAL");
const goLiveReady = blocked.length === 0;

process.stdout.write("Section 18 gate status\n");
process.stdout.write("---------------------\n");
for (const gate of gates) {
  process.stdout.write(`[${gate.status}] ${gate.label} — ${gate.detail}\n`);
}
process.stdout.write(
  `\nGo-live claim: ${goLiveReady ? "ALLOWED" : "FORBIDDEN"} (${blocked.length} open gate(s))\n`,
);

if (requireGoLive && !goLiveReady) {
  process.stderr.write(
    "FAIL Section 18 --require-go-live: blockers remain; do not claim production-ready.\n",
  );
  process.exitCode = 1;
}
