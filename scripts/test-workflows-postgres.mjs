import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
const name = `streakbooks-workflows-${process.pid}`;
const windowsDocker = path.join(
  process.env.ProgramFiles ?? "C:\\Program Files",
  "Docker",
  "Docker",
  "resources",
  "bin",
  "docker.exe",
);
const dockerBinary =
  process.platform === "win32" &&
  !process.env.PATH?.split(path.delimiter).some((entry) =>
    existsSync(path.join(entry, "docker.exe")),
  ) &&
  existsSync(windowsDocker)
    ? windowsDocker
    : "docker";
// Windows Docker Desktop selects its named-pipe context from the local CLI config;
// Linux CI uses the job's isolated Unix socket explicitly.
const prefix = process.platform === "win32" ? [] : ["--host=unix:///var/run/docker.sock"];
const docker = (args, input) =>
  execFileSync(dockerBinary, [...prefix, ...args], {
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
    sql(fn("supabase/migrations/20261022125237_settings_centre_foundation.sql", name));
  const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((name) =>
    name.endsWith("_accounting_workflow_depth.sql"),
  );
  if (migrations.length !== 1)
    throw new Error("Expected exactly one accounting workflow migration");
  sql(read(`supabase/migrations/${migrations[0]}`));
  sql(read("tests/integration/accounting-workflows.sql"));
  sql(read("tests/fixtures/workflows/settings-currencies-baseline.sql"));
  sql(read("supabase/migrations/20261104115821_settings_currencies_atomic.sql"));
  sql(read("tests/integration/settings-currencies-atomic.sql"));
  sql(read("tests/fixtures/workflows/settings-legacy-cas-baseline.sql"));
  sql(read("supabase/migrations/20261104165209_legacy_settings_cas.sql"));
  sql(read("tests/integration/settings-legacy-cas.sql"));
  sql(read("tests/fixtures/workflows/settings-company-identity-baseline.sql"));
  sql(read("supabase/migrations/20261126150000_settings_company_identity_atomic.sql"));
  sql(read("tests/integration/settings-company-identity-atomic.sql"));
  sql(read("tests/fixtures/workflows/settings-feature-disable-baseline.sql"));
  sql(
    fn(
      "supabase/migrations/20261022125237_settings_centre_foundation.sql",
      "public.set_organisation_feature",
    ),
  );
  sql(
    "REVOKE ALL ON FUNCTION public.set_organisation_feature(uuid,text,boolean,jsonb,text,text) FROM PUBLIC, anon; " +
      "GRANT EXECUTE ON FUNCTION public.set_organisation_feature(uuid,text,boolean,jsonb,text,text) TO authenticated;",
  );
  sql(read("supabase/migrations/20261104181716_multicurrency_feature_disable_guard.sql"));
  sql(read("tests/integration/settings-feature-disable-guard.sql"));
  sql(read("supabase/migrations/20261126180000_workflow_settings_audit.sql"));
  sql(read("tests/integration/workflow-settings-audit.sql"));
  sql(read("tests/fixtures/workflows/settings-lock-policy-cas-baseline.sql"));
  sql(
    fn(
      "supabase/migrations/20261022125237_settings_centre_foundation.sql",
      "public.set_organisation_lock_policy",
    ),
  );
  sql(
    "REVOKE ALL ON FUNCTION public.set_organisation_lock_policy(uuid,date,date,date,boolean,text) FROM PUBLIC, anon; " +
      "GRANT EXECUTE ON FUNCTION public.set_organisation_lock_policy(uuid,date,date,date,boolean,text) TO authenticated;",
  );
  sql(read("supabase/migrations/20261105041953_settings_lock_policy_cas.sql"));
  sql(read("tests/integration/settings-lock-policy-cas.sql"));
  sql(read("tests/fixtures/workflows/contact-numbering-baseline.sql"));
  sql(read("supabase/migrations/20261105065500_contacts_atomic_number_allocation.sql"));
  sql(read("tests/integration/contact-numbering-atomic.sql"));

  // Four real concurrent INSERT transactions must receive four unique, gap-free
  // numbers. The RLS-safe trigger locks only the organisation's counter row.
  const contactRace = async (index) =>
    promisify(execFile)(
      dockerBinary,
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
        `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true); INSERT INTO public.contacts(company_id,name,kind) VALUES ('10000000-0000-4000-8000-000000000001','Numbering Concurrent ${index}','customer'); SELECT pg_sleep(0.05); COMMIT;`,
      ],
      { env, maxBuffer: 1024 * 1024 },
    );
  await Promise.all([1, 2, 3, 4].map(contactRace));
  sql(
    `DO $$ DECLARE nums text[]; BEGIN
      SELECT array_agg(account_number ORDER BY account_number) INTO nums
      FROM public.contacts WHERE name LIKE 'Numbering Concurrent %';
      IF nums IS DISTINCT FROM ARRAY['C1005','C1006','C1007','C1008']::text[]
        OR (SELECT next_account_number FROM public.company_contact_settings
            WHERE company_id='10000000-0000-4000-8000-000000000001') <> 1009 THEN
        RAISE EXCEPTION 'Parallel contact creation duplicated or skipped numbers';
      END IF;
    END $$;`,
  );
  console.log("Four concurrent contact creates received C1005–C1008, no duplicates or gaps.");
  console.log(
    "Workflow migration compiled. Atomic rollback, permissions, two-tenant RLS, PO edit/conversion, sales lifecycle, deferrals and real shared posting-engine balance/lock scenarios passed.",
  );
  const race = async () =>
    promisify(execFile)(
      dockerBinary,
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
