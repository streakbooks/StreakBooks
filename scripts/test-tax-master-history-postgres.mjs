/**
 * Local, isolated PostgreSQL verification of tax master posted-history guards.
 * Runs only when manually invoked: never starts GitHub Actions or touches Supabase.
 *
 * node scripts/test-tax-master-history-postgres.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifyTaxPostingRaces } from "./tax-posting-races.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = "linkbooks-tax-history-" + process.pid;
const dockerEnv = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
]) {
  delete dockerEnv[key];
}

const windowsDocker = path.join(
  process.env.ProgramFiles ?? "C:\\Program Files",
  "Docker",
  "Docker",
  "resources",
  "bin",
  "docker.exe",
);
const dockerBinary =
  process.platform === "win32" &&
  !process.env.PATH?.split(path.delimiter).some((entry) =>
    existsSync(path.join(entry, "docker.exe")),
  ) &&
  existsSync(windowsDocker)
    ? windowsDocker
    : "docker";
if (dockerBinary !== "docker") {
  process.env.PATH = [path.dirname(dockerBinary), process.env.PATH ?? ""]
    .filter(Boolean)
    .join(path.delimiter);
}
// Keep Windows Docker Desktop's selected context; Linux CI binds its private socket.
const dockerPrefix = process.platform === "win32" ? [] : ["--host=unix:///var/run/docker.sock"];

function docker(args, input) {
  return execFileSync(dockerBinary, [...dockerPrefix, ...args], {
    env: dockerEnv,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function sql(text) {
  return docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-h",
      "127.0.0.1",
      "-X",
      "-q",
      "-A",
      "-t",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

const read = (p) => readFileSync(path.join(root, p), "utf8");
let started = false;
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--network",
    "none",
    "--cpus",
    "2",
    "--memory",
    "768m",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  started = true;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Isolated PostgreSQL did not start");

  sql(read("tests/fixtures/tax-master-history/baseline.sql"));
  sql(read("tests/integration/tax-schema-preflight.sql"));
  sql(read("tests/integration/tax-legacy-tenant-preflight.sql"));
  // Repeat migration to verify idempotent reapplication before data fixtures.
  const migration = read("supabase/migrations/20261107010000_tax_master_posted_history_guard.sql");
  sql(migration);
  sql(migration);
  sql(read("tests/integration/tax-master-schema-postflight.sql"));
  sql(read("tests/integration/tax-master-posted-history.sql"));
  sql(read("tests/integration/tax-extended-posted-sources.sql"));
  const auditMigration = read("supabase/migrations/20261126170000_tax_master_settings_audit.sql");
  sql(auditMigration);
  sql(auditMigration);
  sql(read("tests/integration/tax-master-settings-audit.sql"));
  console.log("PASS: isolated tax posted-history guards and tenant reference tests");
  sql(read("tests/fixtures/tax-master-history/posting-race.sql"));
  await verifyTaxPostingRaces(dockerPrefix[0] ?? "", name);
} finally {
  if (started) {
    try {
      docker(["rm", "-f", name]);
    } catch (error) {
      console.error("Could not remove isolated PostgreSQL container", error);
    }
  }
}
