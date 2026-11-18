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
const name = `linkbooks-purchase-orders-${process.pid}`;
const prefix = ["--host=unix:///var/run/docker.sock"];
const docker = (args, input) =>
  execFileSync("docker", [...prefix, ...args], {
    env,
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
const sqlArgs = [
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
const sql = (input) => docker(sqlArgs, input);
const read = (file) => readFileSync(path.join(root, file), "utf8");
function fn(file, functionName) {
  const source = read(file);
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
  if (start < 0) throw Error(`Missing ${functionName}`);
  return source.slice(start, source.indexOf("$$;", start) + 3);
}
function migration(suffix) {
  const files = readdirSync(path.join(root, "supabase/migrations")).filter((file) =>
    file.endsWith(suffix),
  );
  const nonempty = files.filter((file) => read(`supabase/migrations/${file}`).trim());
  if (nonempty.length !== 1)
    throw Error(`Expected one nonempty ${suffix} migration, found ${nonempty.length}`);
  console.log(`Applying isolated migration: ${nonempty[0]}`);
  sql(read(`supabase/migrations/${nonempty[0]}`));
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
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw Error("Isolated Postgres did not become ready");
  sql(read("tests/fixtures/workflows/baseline.sql"));
  sql(read("tests/fixtures/workflows/purchase-orders-baseline.sql"));
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
  sql(
    fn(
      "supabase/migrations/20261022125237_settings_centre_foundation.sql",
      "public.assert_journal_date_unlocked",
    ),
  );
  // Use the latest committed shared engine and reversal bodies, not replacement stubs.
  sql(
    fn(
      "supabase/migrations/20261107141000_expense_management_petty_cash.sql",
      "public.post_journal",
    ),
  );
  sql(
    fn(
      "supabase/migrations/20261105180000_basic_global_payroll_payments.sql",
      "public.reverse_journal_on",
    ),
  );
  sql(
    fn(
      "supabase/migrations/20261023170000_ledger_write_path_hardening.sql",
      "public.lookup_fx_rate_to_base",
    ),
  );
  migration("_accounting_workflow_depth.sql");
  migration("_po_goods_receipt.sql");
  migration("_po_partial_bill_from_received.sql");
  // Apply enhancements by their real filenames so dependency order matches deployment.
  const enhancements = readdirSync(path.join(root, "supabase/migrations"))
    .filter(
      (file) =>
        /_po_(lifecycle_controls|billing_integrity|requisitions)\.sql$/.test(file) &&
        read(`supabase/migrations/${file}`).trim(),
    )
    .sort();
  if (enhancements.length !== 3) throw Error("Expected all three PO enhancement migrations");
  for (const file of enhancements) {
    console.log(`Applying isolated migration: ${file}`);
    sql(read(`supabase/migrations/${file}`));
  }
  console.log(sql(read("tests/integration/purchase-orders.sql")).trim());
  console.log(sql(read("tests/integration/purchase-orders-billing.sql")).trim());
  console.log(sql(read("tests/integration/purchase-orders-journal-security.sql")).trim());
  console.log(sql(read("tests/integration/purchase-orders-foreign-currency.sql")).trim());
  console.log(sql(read("tests/integration/purchase-orders-requisitions.sql")).trim());
  // Concurrency scenarios are deliberately separate transactions and connections.
  const scenarios = [
    "purchase-orders-race",
    "purchase-orders-convert-race",
    "purchase-orders-requisition-race",
    "purchase-orders-authorise-race",
    "purchase-orders-void-race",
  ];
  for (const scenario of scenarios) {
    const raceSource = read(`tests/integration/${scenario}.sql`);
    const race = () =>
      promisify(execFile)("docker", [...prefix, ...sqlArgs, "-c", raceSource], {
        env,
        maxBuffer: 1024 * 1024,
      });
    await Promise.all([race(), race(), race()]);
    console.log(sql(read(`tests/integration/${scenario}-check.sql`)).trim());
  }
  console.log(sql(read("tests/integration/purchase-orders-reset.sql")).trim());
  console.log(
    `Purchase order integration suite passed: ${sql("SELECT count(*) FROM public.po_test_results;").trim()} SQL assertions, including ${scenarios.length} races of three real concurrent transactions. Isolated fixtures only; no live/staging database or external delivery was tested.`,
  );
} catch (error) {
  const output = error?.stderr?.toString() || error?.stdout?.toString();
  if (output) console.error(output);
  throw error;
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* Startup may have failed before a container existed. */
  }
}
