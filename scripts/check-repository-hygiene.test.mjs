import { test } from "node:test";
import assert from "node:assert/strict";
import { isForbiddenTrackedPath, assertRepositoryHygiene } from "./check-repository-hygiene.mjs";

test("blocks committed local env files regardless of directory", () => {
  for (const path of [".env", ".env.local", "server/.env.production", "src\\config\\.env.test"]) {
    assert.equal(isForbiddenTrackedPath(path), true, path);
  }
  assert.equal(isForbiddenTrackedPath(".env.example"), false);
  assert.equal(isForbiddenTrackedPath("docs/.env.example"), false);
});
test("blocks generated packages and deployment folders", () => {
  for (const path of [
    "node_modules/a/index.js",
    "work/local-api-session.json",
    ".output/server/index.mjs",
    ".vercel/cache/config",
    ".wrangler/tmp/a",
    "coverage/report.html",
    "test-results/state.json",
    "src/main.tsbuildinfo",
  ]) {
    assert.equal(isForbiddenTrackedPath(path), true, path);
  }
});
test("permits normal source and configuration templates", () => {
  for (const path of [
    "src/lib/accounting/ledger-data.ts",
    "supabase/migrations/20261103000000_test.sql",
    "docs/CLEAN_ROOM.md",
    ".github/workflows/quality.yml",
    "src/components/reports/ReportShell.tsx",
  ]) {
    assert.equal(isForbiddenTrackedPath(path), false, path);
  }
});
test("repository has no tracked runtime configuration and necessary ignores", () => {
  assert.equal(assertRepositoryHygiene(), true);
});
