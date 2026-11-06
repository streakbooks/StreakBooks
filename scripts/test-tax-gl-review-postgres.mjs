/**
 * Local, isolated PostgreSQL verification of tax GL review permissions and audit events.
 * Runs only when manually invoked: never starts GitHub Actions or touches Supabase.
 *
 * node scripts/test-tax-gl-review-postgres.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = "linkbooks-tax-gl-review-" + process.pid;
const dockerEnv = { ...process.env };
for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS",
  "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) {
  delete dockerEnv[key];
}

function docker(args, input) {
  // Force a local Docker daemon: Unix socket on Linux/macOS, Docker pipe on Windows.
  const localHost = process.platform === "win32"
    ? "--host=npipe:////./pipe/docker_engine"
    : "--host=unix:///var/run/docker.sock";
  return execFileSync("docker", [localHost, ...args], {
    env: dockerEnv,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function sql(text) {
  return docker([
    "exec", "-i", name, "psql", "-h", "127.0.0.1", "-X", "-q",
    "-A", "-t", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
  ], text);
}

const read = (p) => readFileSync(path.join(root, p), "utf8");
let started = false;
try {
  docker([
    "run", "--detach", "--rm", "--name", name, "--network", "none",
    "--cpus", "2", "--memory", "768m",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17",
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

  sql(read("tests/fixtures/workflows/baseline.sql"));
  sql(read("tests/fixtures/tax-gl-review/baseline.sql"));
  // Repeat migration to verify idempotent reapplication before data fixtures.
  const migration = read("supabase/migrations/20261106134000_tax_gl_review_sessions.sql");
  sql(migration);
  sql(migration);
  sql(read("tests/integration/tax-gl-review-sessions.sql"));
  console.log("PASS: isolated tax GL reviewer permissions, concurrency versions and audit trail");
} finally {
  if (started) {
    try {
      docker(["rm", "-f", name]);
    } catch (error) {
      console.error("Could not remove isolated PostgreSQL container", error);
    }
  }
}
