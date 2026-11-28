import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `streakbooks-realestate-${process.pid}`;
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
const exec = promisify(execFile);

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
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Isolated real-estate database did not start");
  sql(read("tests/fixtures/nonprofit/baseline.sql"));
  sql(read("tests/fixtures/real-estate/contacts.sql"));
  sql(read("supabase/migrations/20261128232000_real_estate_foundation.sql"));
  sql(read("supabase/migrations/20261128232100_real_estate_operations.sql"));
  sql(read("supabase/migrations/20261128232200_real_estate_money.sql"));
  sql(read("supabase/migrations/20261128232300_real_estate_controls.sql"));
  sql(read("supabase/migrations/20261128280000_real_estate_ledger_tie.sql"));
  sql(read("tests/integration/real-estate-foundation.sql"));

  const unit = sql(
    "SELECT id FROM public.realestate_units WHERE unit_code = 'A-102';",
  ).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!unit) throw new Error("Spare unit was not created");
  const claims = `SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}', false);`;
  const statement = `${claims} SELECT public.realestate_place_hold('20000000-0000-4000-8000-000000000001', jsonb_build_object('unit_id','${unit}','holder_name','Race'));`;
  const raced = await Promise.allSettled([
    exec("docker", [...psql, "-c", statement], { encoding: "utf8" }),
    exec("docker", [...psql, "-c", statement], { encoding: "utf8" }),
  ]);
  const fulfilled = raced.filter((result) => result.status === "fulfilled").length;
  if (fulfilled !== 1) {
    throw new Error(
      `Concurrent reservation did not allow exactly one winner: ${raced
        .map((result) => (result.status === "rejected" ? result.reason?.stderr || result.reason?.message : "ok"))
        .join(" | ")}`,
    );
  }
  sql(
    `SELECT public.test_assert((SELECT count(*) = 1 FROM public.realestate_holds WHERE unit_id = '${unit}' AND status = 'active'), 'one active reservation survives a concurrent attempt');`,
  );
  console.log("Real estate isolated PostgreSQL suite passed.");
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* Only this disposable fixture is removed. */
  }
}
