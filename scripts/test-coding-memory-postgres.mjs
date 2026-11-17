import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const prefix = ["--host=unix:///var/run/docker.sock"];
const container = `linkbooks-memory-${process.pid}`;
const docker = (args, input) =>
  execFileSync("docker", [...prefix, ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const psql = [
  "exec",
  "-i",
  container,
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
const read = (p) => readFileSync(path.join(root, p), "utf8");
function table(source, name) {
  const start = source.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
  if (start < 0) throw Error(`Fixture source missing ${name}`);
  return source.slice(start, source.indexOf("\n);", start) + 3);
}
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
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
      docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw Error("Postgres did not start");
  sql(read("tests/fixtures/workflows/baseline.sql"));
  sql(`alter table public.accounts add column name text, add column is_control boolean default false;
    alter type public.journal_source_type add value 'bank_transaction';
    create type public.bank_txn_status as enum ('uncategorised','matched','reconciled','excluded');`);
  const core = read("supabase/migrations/20261019140000_accounting_engine.sql");
  for (const name of ["bank_accounts", "bank_transactions", "reconciliation_links"])
    sql(table(core, name));
  sql(
    table(read("supabase/migrations/20261020220000_banking_workspaces.sql"), "bank_coding_history"),
  );
  sql(
    `create function public.bump_bank_coding_history(uuid,text,text,uuid,text) returns void language sql as $$ select $$;`,
  );
  sql(read("tests/fixtures/coding-memory/setup.sql"));
  const files = readdirSync(path.join(root, "supabase/migrations")).filter((n) =>
    n.endsWith("_bank_coding_memory_events.sql"),
  );
  if (files.length !== 1) throw Error("Expected one Coding Memory migration");
  sql(read(`supabase/migrations/${files[0]}`));
  sql(read("tests/fixtures/coding-memory/scenarios.sql"));
  // Two simultaneous transactions re-link the same approved journal after an unmatch.
  sql(`delete from public.reconciliation_links where bank_transaction_id=md5('base-txn')::uuid;`);
  const query = `set role authenticated; set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}'; begin;
    insert into public.reconciliation_links(company_id,bank_transaction_id,journal_line_id)
    values(md5('company-a')::uuid,md5('base-txn')::uuid,md5('base-bankline')::uuid) on conflict do nothing;
    select pg_sleep(0.15); commit;`;
  await Promise.all(
    [1, 2].map(() => promisify(execFile)("docker", [...prefix, ...psql, "-c", query], { env })),
  );
  sql(`select public.test_assert((select count(*)=1 from public.bank_coding_events where journal_id=md5('base-journal')::uuid),'concurrent event deduplication');
    select public.test_assert((select count(*)=1 from public.audit_events where action='bank_coding_memory.learned' and entity_id=md5('base-txn')::uuid),'concurrent audit deduplication');`);
  sql("select public.test_seed('race');");
  const reversal = promisify(execFile)(
    "docker",
    [
      ...prefix,
      ...psql,
      "-c",
      `set application_name='memory-reversal'; begin; update public.journals set reversed_by_journal_id=md5('race-reversal')::uuid where id=md5('race-journal')::uuid; select pg_sleep(1); commit;`,
    ],
    { env },
  );
  let reversalLocked = false;
  for (let i = 0; i < 100; i++) {
    if (
      sql(
        "select exists(select 1 from pg_stat_activity where application_name='memory-reversal' and wait_event='PgSleep')",
      ).trim() === "t"
    ) {
      reversalLocked = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!reversalLocked) throw Error("Reversal fixture did not acquire its lock");
  let linkDenied = false;
  try {
    await promisify(execFile)(
      "docker",
      [
        ...prefix,
        ...psql,
        "-c",
        `set role authenticated; set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}'; select public.test_link('race');`,
      ],
      { env },
    );
  } catch (error) {
    if (!String(error.stderr).includes("Coding journal is no longer posted")) throw error;
    linkDenied = true;
  }
  await reversal;
  if (!linkDenied) throw Error("Concurrent reversed journal was incorrectly learned");
  sql(`select public.test_assert((select count(*)=0 from public.bank_coding_events where journal_id=md5('race-journal')::uuid),'concurrent reversal cannot learn');
    select public.test_assert((select count(*)=0 from public.reconciliation_links where bank_transaction_id=md5('race-txn')::uuid),'concurrent reversal rolls link back');`);
  console.log(
    `Coding Memory PostgreSQL: ${sql("select count(*) from public.test_assertions").trim()} assertions passed; 0 failed. Isolated fixtures, no production connection. Includes concurrent relink and reversal sessions.`,
  );
} finally {
  try {
    docker(["rm", "--force", container]);
  } catch {
    /* Preserve original failure. */
  }
}
