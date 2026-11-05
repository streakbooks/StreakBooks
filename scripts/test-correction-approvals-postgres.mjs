import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const containerName = "linkbooks-correction-approvals-" + process.pid;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
]) {
  delete env[key];
}

function docker(args, input) {
  return execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
}

function runSql(file) {
  const source = readFileSync(path.join(root, file), "utf8");
  return docker(
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-h",
      "127.0.0.1",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
    ],
    source,
  );
}

try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
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
  for (let i = 0; i < 120; i++) {
    try {
      docker(["exec", containerName, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Isolated correction approval PostgreSQL did not become ready");

  runSql("tests/fixtures/correction-approvals/baseline.sql");
  runSql("supabase/migrations/20261105210000_correction_maker_checker_approvals.sql");
  console.log(runSql("tests/integration/correction-maker-checker.sql").trim());
  console.log(
    "Maker/checker enforcement, self-approval denial, tenant RLS, request versioning, " +
      "stale payload refusal, immutable events and opt-in policy passed in PostgreSQL 17.",
  );
} finally {
  try {
    docker(["rm", "-f", containerName]);
  } catch {
    // Cleanup is best-effort if the isolated database container already exited.
  }
}
