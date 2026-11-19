#!/usr/bin/env node
/**
 * Honest Section 18 gate reporter. Never claims go-live from chrome alone.
 * Exit 0 with a status table by default. Pass --require-go-live to fail when
 * any blocker remains (used only when explicitly requesting a go-live claim).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { verifyProductionRevision } from "./lib/production-revision.mjs";
import { validateStagingEnvironment } from "./lib/staging-target.mjs";

const root = process.cwd();
const requireGoLive = process.argv.includes("--require-go-live");

function fileExists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function stagingGate() {
  try {
    validateStagingEnvironment(process.env);
    return {
      status: "READY",
      detail:
        "Configuration passed preflight. Authenticated staging tests still need passing evidence.",
    };
  } catch (error) {
    return { status: "BLOCKED", detail: error.message };
  }
}

async function productionGate() {
  if (!process.argv.includes("--verify-production")) {
    return {
      status: "UNVERIFIED",
      detail: "Use --verify-production with E2E_PRODUCTION_URL to verify the checked-out revision.",
    };
  }

  try {
    const expectedCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    await verifyProductionRevision({
      productionUrl: process.env.E2E_PRODUCTION_URL,
      expectedCommit,
    });
    return { status: "PASS", detail: `The production origin reports revision ${expectedCommit}.` };
  } catch (error) {
    return { status: "UNVERIFIED", detail: error.message };
  }
}

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
    label: "Production deployment of the release revision",
    ...(await productionGate()),
  },
  {
    id: "staging-e2e",
    label: "Authenticated staging E2E",
    ...stagingGate(),
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

const blocked = gates.filter((g) => g.status !== "PASS");
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
