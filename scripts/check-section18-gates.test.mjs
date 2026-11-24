import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyProductionRevision } from "./lib/production-revision.mjs";

const report = fileURLToPath(new URL("./check-section18-gates.mjs", import.meta.url));
const preflight = fileURLToPath(new URL("./check-staging-target.mjs", import.meta.url));
const staging = {
  E2E_STAGING_ENABLED: "true",
  E2E_BASE_URL: "https://staging.example.invalid",
  E2E_EXPECTED_STAGING_HOST: "staging.example.invalid",
  E2E_PRODUCTION_URL: "https://production.example.invalid",
  E2E_EMAIL: "fixture@example.invalid",
  E2E_PASSWORD: "fixture-password",
};

function run(script, configuration, ...args) {
  return runIn(fileURLToPath(new URL("../", import.meta.url)), script, configuration, ...args);
}

function runIn(cwd, script, configuration, ...args) {
  const inherited = Object.entries(process.env).filter(([name]) => !name.startsWith("E2E_"));
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...Object.fromEntries(inherited), ...configuration },
    cwd,
  });
  assert.ifError(result.error);
  return result;
}

test("the reporting command separates deployment evidence from the documented alias", () => {
  const result = run(report, {});
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[PASS\] Local chrome\/honesty gates/);
  assert.match(result.stdout, /\[UNVERIFIED\] Production deployment of the release revision/);
  assert.match(result.stdout, /\[BLOCKED\] Authenticated staging E2E/);
  assert.match(result.stdout, /FORBIDDEN \(6 open gate\(s\)\)/);
});

test("valid staging configuration still counts as an open gate", () => {
  assert.equal(run(preflight, staging).status, 0);
  const result = run(report, staging, "--require-go-live");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[READY\] Authenticated staging E2E/);
  assert.match(result.stdout, /FORBIDDEN \(6 open gate\(s\)\)/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-password|fixture@example/);
});

test("production cannot be reported ready for authenticated staging tests", () => {
  const configuration = { ...staging, E2E_PRODUCTION_URL: staging.E2E_BASE_URL };
  const preflightResult = run(preflight, configuration);
  const result = run(report, configuration, "--require-go-live");
  assert.equal(preflightResult.status, 1);
  assert.equal(result.status, 1);
  assert.match(preflightResult.stderr, /against the production hostname/);
  assert.match(result.stdout, /\[BLOCKED\] Authenticated staging E2E.*production hostname/);
});

test("staging requires production separation and a configured account", () => {
  for (const overrides of [{ E2E_PRODUCTION_URL: "" }, { E2E_PASSWORD: " " }]) {
    const result = run(report, { ...staging, ...overrides });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[BLOCKED\] Authenticated staging E2E/);
  }
});

test("failed local checks leave the Section 18 gate open", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "streakbooks-section18-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ scripts: { "check:modules": 'node -e "process.exit(1)"' } }),
  );

  const result = runIn(cwd, report, {}, "--require-go-live");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[BLOCKED\] Local chrome\/honesty gates.*check:modules/);
});

const expectedCommit = "a".repeat(40);
const productionUrl = staging.E2E_PRODUCTION_URL;

test("production verification requires an exact revision on the configured HTTPS origin", async () => {
  await verifyProductionRevision({
    productionUrl,
    expectedCommit,
    request: async (url, options) => {
      assert.equal(url.origin, productionUrl);
      assert.equal(url.pathname, "/release-revision.json");
      assert.equal(url.searchParams.get("expected"), expectedCommit);
      assert.equal(options.redirect, "manual");
      return Response.json({ commit: expectedCommit, environment: "production" });
    },
  });
});

test("production verification rejects missing or stale files and preview metadata", async () => {
  const cases = [
    [new Response(null, { status: 404 }), /HTTP 404/],
    [new Response("<html/>"), /did not return a revision JSON file/],
    [Response.json({ commit: "b".repeat(40), environment: "production" }), /expected/],
    [Response.json({ commit: expectedCommit, environment: "preview" }), /valid build metadata/],
  ];
  for (const [response, message] of cases) {
    await assert.rejects(
      verifyProductionRevision({ productionUrl, expectedCommit, request: async () => response }),
      message,
    );
  }
});

test("production verification does not request plain HTTP or follow a redirect", async () => {
  await assert.rejects(
    verifyProductionRevision({
      productionUrl: "http://production.example.invalid",
      expectedCommit,
      request: async () => assert.fail("Unsafe URL was requested"),
    }),
    /must use HTTPS/,
  );
  await assert.rejects(
    verifyProductionRevision({
      productionUrl,
      expectedCommit,
      request: async () => Response.redirect("https://other.example.invalid/"),
    }),
    /returned a redirect/,
  );
});
