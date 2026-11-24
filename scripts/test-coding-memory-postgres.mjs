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
const container = `streakbooks-memory-${process.pid}`;
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
  const files = readdirSync(path.join(root, "supabase/migrations")).filter(
    (n) =>
      n.endsWith("_bank_coding_memory_events.sql") ||
      n.endsWith("_scoped_coding_memory_reset.sql") ||
      n.endsWith("_lock_coding_memory_control_scope.sql"),
  );
  if (files.length !== 3)
    throw Error("Expected the foundation, scoped reset and scope lock migrations");
  for (const file of files.sort()) sql(read(`supabase/migrations/${file}`));
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
  sql(
    `select public.test_assert((select status::text='posted' and reversed_by_journal_id is null from public.journals where id=md5('race-journal')::uuid),'concurrent reversal starts with posted journal');`,
  );
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
    // Either guard can observe the committed reversal, depending on scheduling:
    // the initial source read or the recheck after waiting for its row lock.
    if (
      !String(error.stderr).includes("Coding journal is no longer posted") &&
      !String(error.stderr).includes("Coding evidence does not match the posted bank transaction")
    )
      throw error;
    linkDenied = true;
  }
  await reversal;
  if (!linkDenied) throw Error("Concurrent reversed journal was incorrectly learned");
  sql(`select public.test_assert((select count(*)=0 from public.bank_coding_events where journal_id=md5('race-journal')::uuid),'concurrent reversal cannot learn');
    select public.test_assert((select reversed_by_journal_id=md5('race-reversal')::uuid from public.journals where id=md5('race-journal')::uuid),'concurrent denial follows committed reversal');
    select public.test_assert((select count(*)=0 from public.reconciliation_links where bank_transaction_id=md5('race-txn')::uuid),'concurrent reversal rolls link back');`);
  sql(`select public.test_seed('split');
    update public.journal_lines set debit_minor=6000 where id=md5('split-offsetline')::uuid;
    insert into public.journal_lines(id,journal_id,company_id,line_no,account_id,debit_minor,credit_minor)
      values(md5('split-otherline')::uuid,md5('split-journal')::uuid,md5('company-a')::uuid,3,md5('other')::uuid,4000,0);
    set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}'; set role authenticated;
    select public.test_link('split'); reset role;
    select public.test_assert((select jsonb_array_length(allocations)=2 from public.bank_coding_events where journal_id=md5('split-journal')::uuid),'split allocations preserved');
    select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'split not flattened into a single account hint');`);
  sql(read("tests/fixtures/coding-memory/reset-scenarios.sql"));
  // Hold a successful control in an open transaction. Verify concurrent bank and
  // transaction scope changes block, then cancel the holder to roll it back.
  for (const operation of ["preference", "reset"]) {
    const history = `(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid)`;
    const control =
      operation === "preference"
        ? `public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,${history},false)`
        : `public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,${history},md5('held-scope-reset')::uuid)`;
    const holder = promisify(execFile)(
      "docker",
      [
        ...prefix,
        ...psql,
        "-c",
        `set application_name='memory-scope-holder'; set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
       set role authenticated; begin; select ${control}; select pg_sleep(30); commit;`,
      ],
      { env },
    ).then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    try {
      let held = false;
      for (let i = 0; i < 100; i++) {
        if (
          sql(
            "select exists(select 1 from pg_stat_activity where application_name='memory-scope-holder' and wait_event='PgSleep')",
          ).trim() === "t"
        ) {
          held = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      if (!held) throw Error("Scope control did not acquire its locks");
      for (const [label, query] of [
        [
          "bank currency",
          "update public.bank_accounts set currency_code='USD' where id=md5('bank')::uuid",
        ],
        [
          "transaction bank",
          "update public.bank_transactions set bank_account_id=md5('bank2')::uuid where id=md5('next-txn')::uuid",
        ],
      ]) {
        let blocked = false;
        try {
          sql(`set lock_timeout='200ms'; ${query};`);
        } catch (error) {
          if (!String(error.stderr).includes("lock timeout")) throw error;
          blocked = true;
        }
        if (!blocked) throw Error(`${operation} did not protect ${label}`);
        sql(`select public.test_assert(true,'${operation} holds ${label} scope until commit');`);
      }
    } finally {
      sql(
        "select pg_cancel_backend(pid) from pg_stat_activity where application_name='memory-scope-holder'",
      );
      const result = await holder;
      if (
        !result.error ||
        !String(result.error.stderr).includes("canceling statement due to user request")
      ) {
        throw Error("Scope holder did not roll back on cancellation");
      }
    }
    sql(
      `set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
       select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'cancelled ${operation} keeps learning intact');`,
    );
  }
  const feedbackRace = `set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}'; set role authenticated;
    select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('bank2-txn')::uuid,
      (select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),'rejected',md5('race-feedback')::uuid);`;
  const resetRace = `set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}'; set role authenticated;
    select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('bank2-txn')::uuid,
      (select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('race-reset')::uuid);`;
  for (const command of [feedbackRace, resetRace]) {
    const results = await Promise.all(
      [1, 2].map(() => promisify(execFile)("docker", [...prefix, ...psql, "-c", command], { env })),
    );
    if (results[0].stdout !== results[1].stdout)
      throw Error("Concurrent retry returned different receipts");
  }
  sql(`select public.test_assert((select count(*)=1 from public.bank_coding_memory_resets where request_id=md5('race-reset')::uuid),'concurrent reset receipt deduplicated');
    select public.test_assert((select count(*)=1 from public.audit_events where action='bank_coding_memory.reset' and details->>'bank_account_id'=md5('bank2')::uuid::text),'concurrent reset audit deduplicated');
    select public.test_assert((select count(*)=1 from public.bank_coding_feedback where request_id=md5('race-feedback')::uuid),'concurrent feedback receipt deduplicated');`);
  sql(`set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
    select public.test_denied('select public.reset_demo_company(md5(''company-a'')::uuid)','reset requires explicit permission');
    insert into public.test_permissions values(md5('company-a')::uuid,'11111111-1111-4111-8111-111111111111','demo.reset');
    select public.test_denied('select public.reset_demo_company(md5(''company-a'')::uuid)','production company cannot reset');
    select public.test_assert((select count(*)>0 from public.bank_coding_events),'denied reset preserves events');
    update public.companies set is_demo=true where id=md5('company-a')::uuid;
    set test.fail_reset='on';
    select public.test_denied('select public.reset_demo_company(md5(''company-a'')::uuid)','parent reset failure propagates');
    set test.fail_reset='off';
    select public.test_assert((select count(*)>0 from public.bank_coding_events),'parent reset failure rolls event purge back');
    set role authenticated;
    select public.reset_demo_company(md5('company-a')::uuid);
    reset role;
    select public.test_assert((select count(*)=0 from public.bank_coding_events),'authorised demo reset clears events');
    select public.test_assert((select count(*)=0 from public.bank_coding_feedback),'authorised demo reset clears feedback');
    select public.test_assert((select count(*)=0 from public.bank_coding_memory_preferences),'authorised demo reset clears preferences');
    select public.test_assert((select count(*)=0 from public.bank_coding_memory_controls),'authorised demo reset clears scoped controls');
    select public.test_assert((select count(*)=0 from public.bank_coding_memory_resets),'authorised demo reset clears reset receipts');`);
  console.log(
    `Coding Memory PostgreSQL: ${sql("select count(*) from public.test_assertions").trim()} assertions passed; 0 failed. Isolated fixtures, no production connection. Includes concurrent relink, reversal, feedback and reset sessions.`,
  );
} finally {
  try {
    docker(["rm", "--force", container]);
  } catch {
    /* Preserve original failure. */
  }
}
