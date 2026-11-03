import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Explicit local daemon; never inherit a remote Docker context or expose database ports.
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const name = `linkbooks-platform-test-${process.pid}`;
const docker = (args, input) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const sql = (input) =>
  docker(
    ["exec", "-i", name, "psql", "-X", "-q", "-A", "-t", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    input,
  );
const migration = (name) => readFileSync(path.join(root, "supabase/migrations", name), "utf8");
function fn(source, name) {
  const start = source.search(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name.replaceAll(".", "\\.")}\\(`),
  );
  if (start < 0) throw new Error(`Missing fixture source ${name}`);
  return source.slice(start, source.indexOf("$$;", start) + 3);
}
function table(source, name) {
  const start = source.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
  if (start < 0) throw new Error(`Missing table ${name}`);
  return source.slice(start, source.indexOf("\n);", start) + 3);
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
    "--shm-size",
    "128m",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw new Error("Isolated Postgres did not start");
  sql(readFileSync(path.join(root, "tests/fixtures/platform/baseline.sql"), "utf8"));
  const control = migration("20261030144257_superadmin_control_plane.sql");
  sql(control.slice(0, control.indexOf("-- Narrow the existing customer access helpers")));
  sql(fn(control, "private.platform_mutate"));
  sql(fn(control, "public.platform_mutate"));
  sql(
    "REVOKE ALL ON FUNCTION private.platform_mutate(text,uuid,jsonb,text), public.platform_mutate(text,uuid,jsonb,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION private.platform_mutate(text,uuid,jsonb,text), public.platform_mutate(text,uuid,jsonb,text) TO authenticated;",
  );
  const hardening = migration("20261030145148_superadmin_transactional_billing_and_hardening.sql");
  sql(hardening.slice(0, hardening.indexOf("DO $$")));
  sql(
    fn(
      migration("20261030145424_superadmin_scoped_controls_and_operations.sql"),
      "private.platform_details",
    ),
  );
  const entitlement = migration("20261102120000_entitlement_price_book.sql");
  sql(
    table(entitlement, "approval_requests") +
      "\n" +
      table(entitlement, "entitlement_overrides") +
      "\n" +
      fn(entitlement, "private.platform_can"),
  );
  sql(
    "ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.approval_requests,public.entitlement_overrides FROM PUBLIC,anon,authenticated;",
  );
  // PL/pgSQL compiles dependencies lazily. DDL replay alone does not verify every RPC.
  const pending = readdirSync(path.join(root, "supabase/migrations"))
    .filter((n) => n >= "20261102190000" && n <= "20261102619999" && n.endsWith(".sql"))
    .sort();
  for (const name of pending) sql(migration(name));
  sql(
    "INSERT INTO public.companies(id,name) VALUES('20000000-0000-4000-8000-000000000004','Legacy fixture'); INSERT INTO public.break_glass_grants(id,company_id,requester_id,status,reason,expires_at) VALUES('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','pending','Private legacy investigation','2035-01-01');",
  );
  sql(migration("20261103000000_supervised_support_workflow.sql"));
  sql(fn(control, "public.platform_support_read"));
  sql(
    "REVOKE ALL ON FUNCTION public.platform_support_read(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.platform_support_read(uuid) TO authenticated;",
  );
  sql(readFileSync(path.join(root, "tests/integration/platform-supervised-support.sql"), "utf8"));
  console.log(
    `${pending.length} existing pending migrations + supervised support migration compiled; support authorization and lifecycle assertions passed.`,
  );
  sql(migration("20261103051315_platform_search_navigation.sql"));
  sql(readFileSync(path.join(root, "tests/integration/platform-search-navigation.sql"), "utf8"));
  console.log(
    "Platform navigation: exact records, role-scoped search, escaping, rate limiting and audit assertions passed.",
  );
  sql(migration("20261103055903_platform_operational_workflows.sql"));
  sql(
    readFileSync(path.join(root, "tests/integration/platform-operational-workflows.sql"), "utf8"),
  );
  console.log(
    "Operational workflows: authorization, lifecycle, version conflicts, idempotency, segment retention and undo passed.",
  );
  sql(migration("20261103060832_platform_workers_and_observed_alerts.sql"));
  sql(migration("20261103061120_platform_worker_dead_letter_guard.sql"));
  sql(migration("20261103061306_platform_worker_minute_alignment.sql"));
  sql(readFileSync(path.join(root, "tests/integration/platform-workers-alerts.sql"), "utf8"));
  console.log(
    "Operational worker: real handler effects, retries, dead letters, measured alerts, dedupe and recovery passed.",
  );
  // Actual independent database sessions exercise simultaneous requests for the same company.
  const run = (actor, statement, delay) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "--host=unix:///var/run/docker.sock",
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
        ],
        { env },
      );
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
      child.stdin.end(
        `BEGIN; SET LOCAL ROLE authenticated; SELECT fixture.login(${actor}); ${statement}; SELECT pg_sleep(${delay}); COMMIT;`,
      );
    });
  const statement =
    "SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000003','Concurrent support request',now()+interval '1 hour',gen_random_uuid())";
  const results = await Promise.all([run(1, statement, 0.5), run(1, statement, 0)]);
  if (
    results.filter((r) => r.code === 0).length !== 1 ||
    !results.find((r) => r.code !== 0)?.output.includes("already has break-glass access")
  )
    throw new Error("Concurrent requests did not produce one winner");
  console.log("Concurrent requests: exactly one committed, second rejected; no duplicate access.");
  const gid = sql(
    "SELECT id FROM public.break_glass_grants WHERE company_id='20000000-0000-4000-8000-000000000003' AND status='pending'",
  ).trim();
  if (!/^[0-9a-f-]{36}$/.test(gid)) throw new Error("No pending concurrent request");
  const decide = `SELECT public.platform_decide_break_glass('${gid}','approved','Concurrent independent decision')`;
  const decisions = await Promise.all([run(6, decide, 0.5), run(6, decide, 0)]);
  if (
    decisions.filter((r) => r.code === 0).length !== 1 ||
    !decisions.find((r) => r.code !== 0)?.output.includes("no longer pending")
  )
    throw new Error("Concurrent approvals did not produce one decision");
  if (
    sql(
      "SELECT count(*) FROM public.platform_support_grants WHERE company_id='20000000-0000-4000-8000-000000000003'",
    ).trim() !== "1"
  )
    throw new Error("Duplicate support effect");
  console.log("Concurrent approvals: exactly one committed and one support grant created.");
  const duplicateCase = `SELECT public.platform_ops_apply('cases.create','{"company_id":"20000000-0000-4000-8000-000000000003","subject":"Concurrent operational fixture"}','Identical submission retry','80000000-0000-4000-8000-000000000005')`;
  const retries = await Promise.all([run(1, duplicateCase, 0.5), run(1, duplicateCase, 0)]);
  if (retries.some((r) => r.code !== 0))
    throw new Error("Concurrent receipt retry failed: " + JSON.stringify(retries));
  if (
    sql(
      "SELECT count(*) FROM public.platform_service_cases WHERE subject='Concurrent operational fixture'",
    ).trim() !== "1"
  )
    throw new Error("Concurrent operation duplicated its effect");
  console.log(
    "Concurrent operations: both retries succeed with exactly one case and audit effect.",
  );
  sql(
    readFileSync(path.join(root, "docs/superadmin/rollbacks/disable-platform-worker.sql"), "utf8"),
  );
  sql(
    `SELECT set_config('request.jwt.claims','{}',false); DO $$ BEGIN IF private.platform_worker_tick()->>'skipped'<>'Worker disabled' THEN RAISE EXCEPTION 'Worker disable failed';END IF; IF NOT EXISTS(SELECT 1 FROM public.platform_job_runs) OR NOT EXISTS(SELECT 1 FROM public.platform_alert_events) THEN RAISE EXCEPTION 'Worker disable lost history'; END IF;END $$; SET ROLE authenticated;SELECT fixture.login(1);SELECT fixture.denied($q$SELECT public.platform_automation_action('jobs.enqueue','{"kind":"check_operations"}','Must remain disabled',gen_random_uuid())$q$,'permission denied');RESET ROLE;`,
  );
  console.log("Worker disable: scheduler/mutations stopped; attempt and alert history retained.");
  sql(
    readFileSync(
      path.join(root, "docs/superadmin/rollbacks/disable-platform-operations.sql"),
      "utf8",
    ),
  );
  sql(
    `SET ROLE authenticated;SELECT fixture.login(1);SELECT fixture.denied($q$SELECT public.platform_ops_context()$q$,'permission denied'); RESET ROLE; DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.platform_service_cases WHERE subject='Review fixture support') THEN RAISE EXCEPTION 'Disable lost history'; END IF; END $$;`,
  );
  console.log("Operations disable: entry points denied, records and audit retained.");
  sql(
    readFileSync(
      path.join(root, "docs/superadmin/rollbacks/disable-supervised-support.sql"),
      "utf8",
    ),
  );
  sql(`SET ROLE authenticated; SELECT fixture.login(1);
    SELECT fixture.denied($q$SELECT private.platform_support_read('20000000-0000-4000-8000-000000000003')$q$,'permission denied');
    SELECT fixture.denied($q$SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000004','Rollback denies requests',now()+interval '1 hour',NULL)$q$,'permission denied');
    RESET ROLE; DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.platform_audit WHERE action='support.read') THEN RAISE EXCEPTION 'Rollback lost audit history'; END IF; END $$;`);
  console.log("Disable rollback: requests and diagnostic reads denied; audit history retained.");
  sql(
    readFileSync(
      path.join(root, "docs/superadmin/rollbacks/undo-platform-search-navigation.sql"),
      "utf8",
    ),
  );
  sql(
    "SET ROLE authenticated; SELECT fixture.login(1); SELECT public.platform_global_search('Paged Company'); SELECT fixture.denied($q$SELECT public.platform_record('businesses','20000000-0000-4000-8000-000000000001')$q$,'does not exist'); RESET ROLE;",
  );
  console.log(
    "Navigation rollback: previous search restored and new record RPC removed; audit retained.",
  );
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* original error is preserved */
  }
}
