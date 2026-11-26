import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `streakbooks-firm-access-${process.pid}`;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];

function docker(args, input) {
  return execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function sql(file) {
  return docker(
    ["exec", "-i", name, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    readFileSync(path.join(root, file), "utf8"),
  );
}

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
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Isolated PostgreSQL did not become ready");
  sql("tests/fixtures/firm-access/baseline.sql");
  sql("tests/fixtures/firm-access/legacy-firm-members.sql");
  sql("supabase/migrations/20261126043433_firm_client_access_governance.sql");
  console.log(sql("tests/integration/firm-access-governance.sql").trim());
  console.log("Firm access governance PostgreSQL scenarios passed in an isolated database.");
} finally {
  try {
    docker(["rm", "-f", name]);
  } catch {
    // The disposable database may have exited already.
  }
}
