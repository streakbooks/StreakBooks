import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `streakbooks-nonprofit-${process.pid}`;
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
  if (!ready) throw new Error("Isolated nonprofit database did not start");
  sql(read("tests/fixtures/nonprofit/baseline.sql"));
  sql(read("supabase/migrations/20261128220000_nonprofit_fund_accounting.sql"));
  sql(read("supabase/migrations/20261128221000_nonprofit_operations.sql"));
  sql(read("supabase/migrations/20261128233000_nonprofit_posting_depth.sql"));
  sql(read("tests/integration/nonprofit-fund-accounting.sql"));

  const fund = sql(
    "SELECT id FROM public.nonprofit_funds WHERE code = 'GEN' AND company_id = '20000000-0000-4000-8000-000000000001';",
  ).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!fund) throw new Error("General fund was not created");
  const claims = `SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}', false);`;
  const statement = `${claims} SELECT public.nonprofit_submit_donation('20000000-0000-4000-8000-000000000001', jsonb_build_object('donated_on','2026-11-21','currency_code','USD','amount_minor',200,'idempotency_key','race-1','allocations', jsonb_build_array(jsonb_build_object('fund_id','${fund}','amount_minor',200))));`;
  const raced = await Promise.allSettled([
    exec("docker", [...psql, "-c", statement], { encoding: "utf8" }),
    exec("docker", [...psql, "-c", statement], { encoding: "utf8" }),
  ]);
  if (raced.some((result) => result.status !== "fulfilled")) {
    throw new Error(
      `Concurrent donation replay failed: ${raced.map((result) => (result.status === "rejected" ? result.reason?.stderr || result.reason?.message : "ok")).join(" | ")}`,
    );
  }
  sql(
    "SELECT public.test_assert((SELECT count(*) = 1 FROM public.journals WHERE idempotency_key = 'np-donation-' || (SELECT id::text FROM public.nonprofit_donations WHERE idempotency_key = 'race-1')), 'concurrent duplicate donation posts once');",
  );
  console.log("Nonprofit isolated PostgreSQL fund-accounting suite passed.");
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* Only this disposable fixture is removed. */
  }
}
