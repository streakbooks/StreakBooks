import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("./check-fixed-assets-release.mjs", import.meta.url));

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("Git setup failed: " + args.join(" ") + " / " + result.stderr);
  }
  return result.stdout.trim();
}

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "streakbooks-fa-gate-"));
  const repo = join(folder, "repo");
  const bin = join(folder, "bin");
  const logs = join(folder, "npm-commands.log");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  copyFileSync(runner, join(repo, "scripts", basename(runner)));
  writeFileSync(join(repo, "README.md"), "Local-only fixture; no network access.\n");
  if (process.platform === "win32") {
    writeFileSync(
      join(bin, "npm.cmd"),
      [
        "@echo off",
        'echo %*>>"%FA_TEST_NPM_LOG%"',
        'if /I "%FA_TEST_MUTATE%"=="tracked" if /I "%1"=="run" if /I "%2"=="typecheck" echo Modified>>README.md',
        'if /I "%FA_TEST_MUTATE%"=="untracked" if /I "%1"=="run" if /I "%2"=="typecheck" echo Generated>output-from-build.txt',
        'if /I "%FA_TEST_FAIL%"=="lint" if /I "%1"=="run" if /I "%2"=="lint" exit /b 4',
        "exit /b 0",
        "",
      ].join("\r\n"),
    );
  } else {
    writeFileSync(
      join(bin, "npm"),
      [
        "#!/bin/sh",
        'printf "%s\\n" "$*" >> "$FA_TEST_NPM_LOG"',
        'if [ "$FA_TEST_MUTATE" = "tracked" ] && [ "$1" = "run" ] && [ "$2" = "typecheck" ]; then echo Modified >> README.md; fi',
        'if [ "$FA_TEST_MUTATE" = "untracked" ] && [ "$1" = "run" ] && [ "$2" = "typecheck" ]; then echo Generated > output-from-build.txt; fi',
        'if [ "$FA_TEST_FAIL" = "lint" ] && [ "$1" = "run" ] && [ "$2" = "lint" ]; then exit 4; fi',
        "exit 0",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
  }

  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "local-test@example.invalid");
  git(repo, "config", "user.name", "Local Test");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Fixture only");
  git(repo, "remote", "add", "origin", "https://github.com/streakbooks/StreakBooks.git");
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "HEAD"));
  return { folder, repo, bin, logs };
}

function execute(f, { fail = "", mutate = "", args = [] } = {}) {
  const env = { ...process.env };
  const inheritedPath = process.env.PATH ?? process.env.Path ?? "";
  delete env.Path;
  delete env.path;
  env.PATH = f.bin + delimiter + inheritedPath;
  env.FA_TEST_NPM_LOG = f.logs;
  env.FA_TEST_FAIL = fail;
  env.FA_TEST_MUTATE = mutate;
  const output = spawnSync(process.execPath, [join(f.repo, "scripts", basename(runner)), ...args], {
    cwd: f.repo,
    encoding: "utf8",
    env,
  });
  return { ...output, output: (output.stdout ?? "") + (output.stderr ?? "") };
}

function seen(f) {
  return existsSync(f.logs) ? readFileSync(f.logs, "utf8").trim().split("\n") : [];
}

function caseWithRepo(callback) {
  const f = fixture();
  try {
    callback(f);
  } finally {
    rmSync(f.folder, { recursive: true, force: true });
  }
}

describe("Fixed Assets local non-CI release gate", () => {
  it("runs exactly nine checks on a clean main matching fetched origin/main", () =>
    caseWithRepo((f) => {
      const x = execute(f);
      assert.equal(x.status, 0, x.output);
      assert.match(x.output, /Result: 9 \/ 9 checks passed/);
      assert.match(
        x.output,
        /does NOT certify browser, database, staging or production readiness/i,
      );
      assert.equal(seen(f).length, 9);
      assert.ok(seen(f).includes("test -- src/lib/fixed-assets/"));
      assert.ok(seen(f).includes("test"));
      assert.ok(seen(f).includes("run check:bundle"));
    }));

  it("refuses the old repository without running npm", () =>
    caseWithRepo((f) => {
      git(f.repo, "remote", "set-url", "origin", "https://github.com/streakbooks/StreakBooks.git");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.match(x.output, /authoritative|not linkbusinessadvisory/i);
      assert.equal(seen(f).length, 0);
    }));

  it("never prints a credential-bearing remote URL", () =>
    caseWithRepo((f) => {
      git(f.repo, "remote", "set-url", "origin", "https://secret-value@example.com/StreakBooks.git");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.ok(!x.output.includes("secret-value"));
    }));

  it("refuses feature branches before executing checks", () =>
    caseWithRepo((f) => {
      git(f.repo, "switch", "-q", "-c", "feature/unreviewed");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.match(x.output, /main/i);
      assert.equal(seen(f).length, 0);
    }));

  it("refuses detached HEAD", () =>
    caseWithRepo((f) => {
      git(f.repo, "checkout", "-q", "--detach", "HEAD");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.equal(seen(f).length, 0);
    }));

  it("refuses a changed tracked file", () =>
    caseWithRepo((f) => {
      writeFileSync(join(f.repo, "README.md"), "Uncommitted change\n");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.match(x.output, /working tree/i);
      assert.equal(seen(f).length, 0);
    }));

  it("refuses untracked files", () =>
    caseWithRepo((f) => {
      writeFileSync(join(f.repo, "untracked.txt"), "Incomplete work\n");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.equal(seen(f).length, 0);
    }));

  it("refuses missing local origin/main", () =>
    caseWithRepo((f) => {
      git(f.repo, "update-ref", "-d", "refs/remotes/origin/main");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.match(x.output, /origin\/main/i);
      assert.equal(seen(f).length, 0);
    }));

  it("refuses a local main SHA ahead of tracked origin/main", () =>
    caseWithRepo((f) => {
      writeFileSync(join(f.repo, "README.md"), "New commit\n");
      git(f.repo, "add", "README.md");
      git(f.repo, "commit", "-q", "-m", "Local change");
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.match(x.output, /exactly match/i);
      assert.equal(seen(f).length, 0);
    }));

  it("refuses a local main SHA behind tracked origin/main", () =>
    caseWithRepo((f) => {
      const old = git(f.repo, "rev-parse", "HEAD");
      writeFileSync(join(f.repo, "README.md"), "Commit on origin/main\n");
      git(f.repo, "add", "README.md");
      git(f.repo, "commit", "-q", "-m", "Remote-tracking fixture");
      git(f.repo, "update-ref", "refs/remotes/origin/main", git(f.repo, "rev-parse", "HEAD"));
      git(f.repo, "reset", "-q", "--hard", old);
      const x = execute(f);
      assert.equal(x.status, 2);
      assert.equal(seen(f).length, 0);
    }));

  it("reports a failed task and never calls it a passing release gate", () =>
    caseWithRepo((f) => {
      const x = execute(f, { fail: "lint" });
      assert.equal(x.status, 1, x.output);
      assert.match(x.output, /Result: 8 \/ 9 checks passed/);
      assert.match(x.output, /local release gate FAILED/i);
      assert.equal(seen(f).length, 9);
    }));

  it("blocks final success if npm modifies tracked files after preflight", () =>
    caseWithRepo((f) => {
      const x = execute(f, { mutate: "tracked" });
      assert.equal(x.status, 1, x.output);
      assert.match(x.output, /Result: 9 \/ 9 checks passed/);
      assert.match(x.output, /FINAL GIT CHECK FAILED/);
      assert.match(x.output, /CHANGED — release gate blocked/);
      assert.equal(seen(f).length, 9);
    }));

  it("blocks final success if npm creates unexpected untracked files", () =>
    caseWithRepo((f) => {
      const x = execute(f, { mutate: "untracked" });
      assert.equal(x.status, 1, x.output);
      assert.match(x.output, /FINAL GIT CHECK FAILED/);
      assert.equal(seen(f).length, 9);
    }));

  it("rejects unsupported arguments without running checks", () =>
    caseWithRepo((f) => {
      const x = execute(f, { args: ["--deploy"] });
      assert.equal(x.status, 2);
      assert.equal(seen(f).length, 0);
    }));
});
