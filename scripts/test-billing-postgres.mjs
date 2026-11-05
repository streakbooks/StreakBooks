import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Billing component tests against an isolated, network-less Postgres 17 container.
// Loads the synthetic billing fixture, applies every *_billing_*.sql migration verbatim twice
// (proving idempotency), then runs tests/integration/billing-*.sql once each.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const name = `linkbooks-billing-test-${process.pid}`;
const dockerArgs = (args) => ["--host=unix:///var/run/docker.sock", ...args];
const docker = (args, input) =>
  execFileSync("docker", dockerArgs(args), {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
const psqlArgs = [
  "exec",
  "-i",
  name,
  "psql",
  "-X",
  "-q",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
];
const psql = (input) => docker(psqlArgs, input);

// The billing platform series starts at 20261105161752; earlier *_billing_* files belong to the
// legacy subscription stack and depend on the full hosted schema.
const BILLING_SERIES_START = "20261105161752";
const migrations = readdirSync(path.join(root, "supabase/migrations"))
  .filter(
    (f) => /^\d{14}_billing_[a-z0-9_]+\.sql$/.test(f) && f.slice(0, 14) >= BILLING_SERIES_START,
  )
  .sort();
const suites = readdirSync(path.join(root, "tests/integration"))
  .filter((f) => /^billing-.*\.sql$/.test(f))
  .sort();

let failed = false;
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
    "--shm-size",
    "128m",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      psql("SELECT 1");
      ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw new Error("Isolated Postgres did not start");

  psql(readFileSync(path.join(root, "tests/fixtures/billing/baseline.sql"), "utf8"));
  for (const pass of [1, 2]) {
    for (const file of migrations)
      psql(readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
    console.log(`migration pass ${pass}: ${migrations.length} billing migrations applied`);
  }

  for (const suite of suites) {
    const run = spawnSync("docker", dockerArgs(psqlArgs), {
      env,
      input: readFileSync(path.join(root, "tests/integration", suite), "utf8"),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const passes = (run.stderr.match(/NOTICE:\s+PASS /g) ?? []).length;
    if (run.status !== 0) {
      failed = true;
      console.error(`${suite}: FAILED after ${passes} passing checks`);
      console.error(
        run.stderr
          .split("\n")
          .filter((l) => /ERROR|FAIL/.test(l))
          .join("\n"),
      );
    } else {
      console.log(`${suite}: ${passes} checks passed`);
    }
  }
} catch (error) {
  failed = true;
  console.error(error?.stderr?.toString?.() || error);
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* container already gone */
  }
}
process.exit(failed ? 1 : 0);
