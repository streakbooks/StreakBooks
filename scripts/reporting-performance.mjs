// Database/engine benchmark only. Does not establish deployed HTTP or browser latency.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
const container = "streakbooks-reporting-qa";
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
function query(sql) {
  return new Promise((resolve, reject) => {
    const command = spawn(
      "docker",
      [
        "--host=unix:///var/run/docker.sock",
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { env },
    );
    let output = "",
      error = "";
    command.stdout.on("data", (d) => (output += d));
    command.stderr.on("data", (d) => (error += d));
    command.on("exit", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error))));
    command.stdin.end(sql);
  });
}
const read = (file) => readFileSync(file, "utf8");
await query(read("tests/performance/reporting-fixture.sql"));
const ledger = read("supabase/migrations/20261024130000_reporting_ledger_rpcs.sql");
await query(
  ledger.slice(
    ledger.indexOf("CREATE OR REPLACE FUNCTION public.ledger_balances("),
    ledger.indexOf("-- account_balance_as_of:"),
  ),
);
const reports = read("supabase/migrations/20261025400000_report_rpcs.sql");
await query(
  reports.slice(
    reports.indexOf("CREATE OR REPLACE FUNCTION public.report_to_base_minor("),
    reports.indexOf("-- ledger_monthly_activity"),
  ),
);
await query(
  reports.slice(
    reports.indexOf("CREATE OR REPLACE FUNCTION public.report_cash_summary("),
    reports.indexOf("-- report_gl_summary:"),
  ),
);
const ecosystem = read("supabase/migrations/20261102042056_reporting_ecosystem.sql");
await query(
  ecosystem.slice(
    ecosystem.indexOf("CREATE FUNCTION public.capture_reporting_facts("),
    ecosystem.indexOf("CREATE TABLE public.report_packs("),
  ),
);
const scope =
  "SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';";
const company = "'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'";
const standard = `SELECT json_agg(b) FROM public.ledger_balances(${company},'2026-01-01','2026-10-31',true)b;`;
const dashboard = `SELECT public.capture_reporting_facts(${company},'2026-01-01','2026-10-31');`;
const definition = JSON.stringify({
  columns: [
    { id: "current", mode: "period" },
    { id: "prior", mode: "prior_period" },
  ],
  rows: [],
}).replaceAll("'", "''");
const custom = `SELECT public.capture_custom_report_facts(${company},'2026-01-01','2026-10-31','${definition}'::jsonb);`;
const search = `SELECT count(*) FROM public.report_saved_views WHERE company_id=${company} AND name ILIKE '%report 10%';`;
const times = { standard: [], custom: [], dashboard: [], search: [] };
for (const [name, sql] of Object.entries({ standard, custom, dashboard, search })) {
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const result = await query(scope + sql);
    times[name].push(performance.now() - start);
    if (name === "standard") {
      const rows = JSON.parse(result),
        debit = rows.reduce((s, r) => s + BigInt(r.debit_minor), 0n),
        credit = rows.reduce((s, r) => s + BigInt(r.credit_minor), 0n);
      if (debit !== 5100000n || credit !== 5100000n)
        throw new Error("Independent FX/debit/credit reconciliation failed");
    }
  }
}
const concurrentStart = performance.now();
const concurrent = await Promise.all(Array.from({ length: 25 }, () => query(scope + standard)));
const concurrentMs = performance.now() - concurrentStart;
const summary = {
  environment: {
    database: "PostgreSQL 17 Docker",
    container,
    cpus: 2,
    memoryMiB: 768,
    transport: "local docker exec / psql, includes process overhead",
    scope:
      "SQL aggregation and fact capture only; auth permission helper is an isolated fixture; production RLS is validated separately",
    relevantPostedLines: 100000,
    balancedJournals: 50000,
    accounts: 201,
    savedReports: 1000,
    samplesPerOperation: 25,
  },
  operations: Object.fromEntries(
    Object.entries(times).map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        name,
        {
          p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
          minMs: Math.round(sorted[0]),
          maxMs: Math.round(sorted.at(-1)),
        },
      ];
    }),
  ),
  concurrency: { requests: concurrent.length, errors: 0, totalMs: Math.round(concurrentMs) },
  independentReconciliation: {
    debitsMinor: "5100000",
    creditsMinor: "5100000",
    fxPolicy: "45,000 GBP journals at 100 minor + 5,000 USD journals at 100 minor × 1.2",
  },
  limitations: [
    "Does not measure deployed API authentication, Internet latency, actual browser dashboard load or long-duration memory behavior",
    "The acceptance P95 targets require a separate deployed end-to-end benchmark",
  ],
};
mkdirSync("work", { recursive: true });
writeFileSync("work/reporting-performance.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
