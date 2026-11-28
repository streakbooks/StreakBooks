import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `streakbooks-gym-${process.pid}`;
const docker = (args, input) =>
  execFileSync("docker", args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const psql = [
  "exec",
  "-i",
  name,
  "psql",
  "-h",
  "127.0.0.1",
  "-X",
  "-q",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
];
const sql = (input) => docker(psql, input);
const read = (file) => readFileSync(path.join(root, file), "utf8");

try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--network",
    "none",
    "--memory",
    "1g",
    "--cpus",
    "2",
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
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  if (!ready) throw new Error("Isolated gym database did not start");
  sql(read("tests/fixtures/nonprofit/baseline.sql"));
  sql(read("supabase/migrations/20261128380000_gym_fitness_management.sql"));
  sql(read("tests/integration/gym-fitness.sql"));
  console.log("Gym postgres integration passed");
} finally {
  try {
    docker(["rm", "-f", name]);
  } catch {
    /* container already removed */
  }
}
