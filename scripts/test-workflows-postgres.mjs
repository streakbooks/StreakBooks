import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
const name = `linkbooks-workflows-${process.pid}`;
const prefix = ["--host=unix:///var/run/docker.sock"];
const docker = (args, input) =>
  execFileSync("docker", [...prefix, ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const sql = (input) =>
  docker(
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
    input,
  );
const read = (p) => readFileSync(path.join(root, p), "utf8");
function fn(file, name) {
  const source = read(file);
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) throw Error(`Missing ${name}`);
  return source.slice(start, source.indexOf("$$;", start) + 3);
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
  for (let i = 0; i < 120; i++) {
    try {
      // The temporary init server accepts Unix sockets but not TCP. Wait for the final server.
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw Error("Postgres did not become ready");
  sql(read("tests/fixtures/workflows/baseline.sql"));
  sql(
    fn(
      "supabase/migrations/20261019200000_cross_cutting_settings_fx_demo.sql",
      "public.record_audit_event",
    ),
  );
  sql(
    fn(
      "supabase/migrations/20261024100000_purchases_document_prefixes.sql",
      "public.allocate_document_number",
    ),
  );
  for (const name of ["public.assert_journal_date_unlocked", "public.post_journal"])
    sql(fn("supabase/migrations/20261022180000_settings_centre_foundation.sql", name));
  const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((name) =>
    name.endsWith("_accounting_workflow_depth.sql"),
  );
  if (migrations.length !== 1)
    throw new Error("Expected exactly one accounting workflow migration");
  sql(read(`supabase/migrations/${migrations[0]}`));
  sql(read("tests/integration/accounting-workflows.sql"));
  console.log(
    "Workflow migration compiled. Atomic rollback, permissions, two-tenant RLS, PO edit/conversion, sales lifecycle, deferrals and real shared posting-engine balance/lock scenarios passed.",
  );
  const race = async () =>
    promisify(execFile)(
      "docker",
      [
        ...prefix,
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
        "-c",
        `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true); SELECT public.post_deferral_entry('10000000-0000-4000-8000-000000000001',(SELECT id FROM public.deferral_entries WHERE period_no=2 LIMIT 1),'2026-11-03'); SELECT pg_sleep(0.1); COMMIT;`,
      ],
      { env, maxBuffer: 1024 * 1024 },
    );
  await Promise.all([race(), race(), race()]);
  const check = sql(
    "DO $$ BEGIN IF (SELECT count(*) FROM public.journals)<>2 OR (SELECT count(*) FROM public.journal_lines)<>4 THEN RAISE EXCEPTION 'Concurrent replay created duplicate recognition journals'; END IF; END $$;",
  );
  sql(
    `UPDATE public.companies SET is_demo=true WHERE id='10000000-0000-4000-8000-000000000001'; SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false); SELECT public.reset_demo_company('10000000-0000-4000-8000-000000000001'); DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.sales_orders) OR EXISTS(SELECT 1 FROM public.deferral_schedules) OR EXISTS(SELECT 1 FROM public.deferral_entries) THEN RAISE EXCEPTION 'Demo reset left workflow dependencies'; END IF; END $$;`,
  );
  console.log("Guarded Demo reset clears workflow dependencies; non-demo reset is denied.");
  console.log(
    "Three parallel recognition requests committed exactly one additional balanced journal. No database ports or production data used.",
  );
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* Nothing to remove if startup failed. */
  }
}
