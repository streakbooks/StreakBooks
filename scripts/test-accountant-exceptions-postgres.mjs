import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = "linkbooks-accountant-exceptions-" + process.pid;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
]) delete env[key];

function docker(args, input) {
  return execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
}

function sql(file) {
  return docker(
    [
      "exec", "-i", name, "psql", "-h", "127.0.0.1",
      "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
    ],
    readFileSync(path.join(root, file), "utf8"),
  );
}

try {
  docker([
    "run", "--detach", "--rm", "--name", name,
    "--network", "none", "--cpus", "2", "--memory", "768m",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17",
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Isolated PostgreSQL never became ready");
  sql("tests/fixtures/accountant-exceptions/baseline.sql");
  sql("supabase/migrations/20261104073500_accountant_journal_exception_reviews.sql");
  console.log(sql("tests/integration/accountant-exception-reviews.sql").trim());
} finally {
  try {
    docker(["rm", "-f", name]);
  } catch {
    // The isolated database container may have exited.
  }
}
