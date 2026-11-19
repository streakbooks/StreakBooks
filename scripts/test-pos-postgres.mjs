import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = `linkbooks-pos-${process.pid}`;
const docker = (args, input) =>
  execFileSync("docker", args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const psql = [
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
];
const sql = (input) => docker(psql, input);
const read = (file) => readFileSync(path.join(root, file), "utf8");
const posMigrations = readdirSync(path.join(root, "supabase/migrations"))
  .filter((file) => file.includes("_pos_"))
  .sort();
if (posMigrations.length < 2) {
  throw Error(
    `Expected POS migrations; found ${posMigrations.length}: ${posMigrations.join(", ")}`,
  );
}
const claims = `SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);`;
const company = "20000000-0000-4000-8000-000000000001";
const register = "50000000-0000-4000-8000-000000000001";
async function race(operationIds) {
  return Promise.allSettled(
    operationIds.map((id) =>
      promisify(execFile)(
        "docker",
        [
          ...psql,
          "-c",
          `${claims} SELECT public.pos_open_session('${company}','${register}','${id}',100);`,
        ],
        { encoding: "utf8" },
      ),
    ),
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
    "--memory",
    "768m",
    "--cpus",
    "2",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
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
  if (!ready) throw Error("Isolated POS database did not start");
  sql(read("tests/fixtures/pos/baseline.sql"));
  const mfa = read("supabase/migrations/20261029101434_mfa_aal2_rls_enforcement.sql");
  sql(mfa.slice(0, mfa.indexOf("CREATE OR REPLACE FUNCTION private.apply_mfa_policies()")));

  const audit = read("supabase/migrations/20261019200000_cross_cutting_settings_fx_demo.sql");
  const start = audit.indexOf("CREATE OR REPLACE FUNCTION public.record_audit_event(");
  sql(audit.slice(start, audit.indexOf("$$;", start) + 3));
  for (const file of posMigrations) {
    sql(read(`supabase/migrations/${file}`));
  }
  sql(read("tests/integration/pos-register-sessions.sql"));
  sql(read("tests/integration/pos-cash-sale.sql"));
  sql(read("tests/integration/pos-mfa.sql"));
  const identical = await race([
    "80000000-0000-4000-8000-000000000001",
    "80000000-0000-4000-8000-000000000001",
  ]);
  if (identical.some((result) => result.status !== "fulfilled"))
    throw Error("Concurrent identical opening retries failed");
  if (identical[0].value.stdout.trim() !== identical[1].value.stdout.trim())
    throw Error("Concurrent opening retries returned different sessions");
  sql(
    `SELECT public.test_assert((SELECT count(*)=1 FROM public.pos_register_sessions WHERE closed_at IS NULL),'concurrent replay creates exactly one session');`,
  );
  sql(
    `${claims} SELECT public.pos_close_session('${company}',(SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL),'90000000-0000-4000-8000-000000000001',100);`,
  );
  const competing = await race([
    "80000000-0000-4000-8000-000000000002",
    "80000000-0000-4000-8000-000000000003",
  ]);
  if (competing.filter((result) => result.status === "fulfilled").length !== 1)
    throw Error("Competing opens did not produce exactly one winner");
  sql(
    `SELECT public.test_assert((SELECT count(*)=1 FROM public.pos_register_sessions WHERE closed_at IS NULL),'competing opens preserve one-open-session invariant');`,
  );
  const closingIds = [
    "90000000-0000-4000-8000-000000000002",
    "90000000-0000-4000-8000-000000000003",
  ];
  const closes = await Promise.allSettled(
    closingIds.map((id) =>
      promisify(execFile)(
        "docker",
        [
          ...psql,
          "-c",
          `${claims} SELECT public.pos_close_session('${company}',(SELECT id FROM public.pos_register_sessions WHERE open_operation_id IN ('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003')),'${id}',100);`,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
  if (closes.filter((result) => result.status === "fulfilled").length !== 1)
    throw Error("Concurrent different close operations both succeeded");
  sql(
    `SELECT public.test_assert((SELECT count(*)=0 FROM public.pos_register_sessions WHERE closed_at IS NULL),'concurrent close locks immutable history');`,
  );
  console.log(
    `POS isolated PostgreSQL migrations (${posMigrations.join(", ")}) and integration suites passed.`,
  );
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* Only this disposable fixture is eligible for cleanup. */
  }
}
