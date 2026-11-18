import { test } from "node:test";
import assert from "node:assert/strict";
import { auditMigrationIdentities } from "./check-migration-identities.mjs";
test("detects the same duplicate primary key that stops Supabase replay", () => {
  const result = auditMigrationIdentities([
    "20261022180000_recurring.sql",
    "20261022180000_settings.sql",
  ]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Duplicate migration version 20261022180000/);
});
test("permits distinct registered versions and ignores non-SQL documentation", () => {
  assert.deepEqual(
    auditMigrationIdentities([
      "20261022125237_settings.sql",
      "20261022180000_recurring.sql",
      "README.md",
    ]),
    { versions: 2, errors: [] },
  );
});
test("rejects migration SQL without a version identity", () => {
  assert.equal(auditMigrationIdentities(["unversioned.sql"]).errors.length, 1);
});
