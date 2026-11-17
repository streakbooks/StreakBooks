import assert from "node:assert/strict";
import { test } from "node:test";
import { validateActionCenterDeployment } from "./action-center-release-gate.mjs";

const sha = "a".repeat(40);
const record = {
  id: "dpl_test123",
  state: "READY",
  target: "production",
  meta: {
    githubOrg: "linkbusinessadvisory",
    githubRepo: "LinkBooks",
    githubCommitRef: "main",
    githubCommitSha: sha,
  },
};

test("approves matching production deployment evidence", () => {
  assert.deepEqual(validateActionCenterDeployment(record, sha), {
    deploymentId: "dpl_test123",
    repository: "linkbusinessadvisory/LinkBooks",
    approvedCommit: sha,
    branch: "main",
    target: "production",
    state: "READY",
  });
});

test("rejects a READY deployment from the previous repository", () => {
  assert.throws(
    () =>
      validateActionCenterDeployment(
        {
          ...record,
          meta: { ...record.meta, githubOrg: "rohitmehra86" },
        },
        sha,
      ),
    /Wrong deployment repository/,
  );
});

test("rejects a non-approved commit", () => {
  assert.throws(
    () =>
      validateActionCenterDeployment(
        {
          ...record,
          meta: { ...record.meta, githubCommitSha: "b".repeat(40) },
        },
        sha,
      ),
    /does not match/,
  );
});

test("rejects non-main branches", () => {
  assert.throws(
    () =>
      validateActionCenterDeployment(
        {
          ...record,
          meta: { ...record.meta, githubCommitRef: "feature/action-center" },
        },
        sha,
      ),
    /main branch/,
  );
});

test("rejects preview and unready deployments", () => {
  for (const target of ["preview", undefined]) {
    assert.throws(
      () => validateActionCenterDeployment({ ...record, target }, sha),
      /target production/,
    );
  }
  for (const state of ["ERROR", "BUILDING", undefined]) {
    assert.throws(() => validateActionCenterDeployment({ ...record, state }, sha), /not READY/);
  }
});

test("fails closed without Git metadata or a verifiable deployment ID", () => {
  assert.throws(() => validateActionCenterDeployment({ ...record, meta: null }, sha), /metadata/);
  assert.throws(() => validateActionCenterDeployment({ ...record, id: "" }, sha), /deployment ID/);
});

test("requires a complete approved commit SHA", () => {
  assert.throws(() => validateActionCenterDeployment(record, "abc123"), /40-character/);
});
