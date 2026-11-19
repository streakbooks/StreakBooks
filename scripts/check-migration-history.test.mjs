import assert from "node:assert/strict";
import { test } from "node:test";
import { compareMigrationHistory } from "./check-migration-history.mjs";

const old = "20261106140000";
const current = "20261118150351";
const files = [`${old}_advisors_chat_leads.sql`, `${current}_files_email_inbox.sql`];
const renames = [{ original: `${old}_files_email_inbox.sql`, replacement: files[1] }];

test("an applied Advisors migration can share a historical Files version without ambiguity", () => {
  assert.deepEqual(
    compareMigrationHistory(files, [{ version: old, name: "advisors_chat_leads" }], renames),
    {
      applied: 1,
      pending: 1,
      blockers: [],
    },
  );
});

test("a previously applied Files migration is flagged even when its old version is local", () => {
  const result = compareMigrationHistory(
    files,
    [{ version: old, name: "files_email_inbox" }],
    renames,
  );
  assert.equal(result.blockers.length, 2);
  assert.match(result.blockers.join("\n"), /already recorded under its old version/);
});

test("missing names and older pending versions both require investigation", () => {
  const result = compareMigrationHistory(files, [{ version: current, name: null }], renames);
  assert.match(result.blockers.join("\n"), /no recorded name/);
  assert.match(result.blockers.join("\n"), /precedes applied version/);
});

test("unknown applied versions and the corrected firm migration require review", () => {
  const firm = "20261106064353";
  const result = compareMigrationHistory(
    [`${firm}_firm_bulk_client_profiles.sql`],
    [
      { version: firm, name: "firm_bulk_client_profiles" },
      { version: old, name: null },
    ],
    [],
  );
  assert.match(result.blockers.join("\n"), /absent from this checkout/);
  assert.match(result.blockers.join("\n"), /historical SQL correction/);
});

test("rejects malformed and repeated history versions", () => {
  const row = { version: old, name: "advisors_chat_leads" };
  assert.throws(
    () => compareMigrationHistory(files, [row, row], renames),
    /Repeated history version/,
  );
  assert.throws(
    () => compareMigrationHistory(files, [{ version: 1 }], renames),
    /14-digit version/,
  );
});
