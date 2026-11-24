# StreakBooks — Firm & Clients Onboarding Release Gate (Batch 4)

## Release decision (2026-11-06)
**BLOCKED / not verified for production.** This batch prepares the release checks
but does not claim a browser or deployment pass.

The preceding merged code batches are:
1. PR #133 — staff workload and capacity.
2. PR #137 — opt-in overdue manager escalation and history.
3. PR #141 — operational reports, daily observed snapshots and secure CSV.

A fourth batch is complete only when its *actual* release checks pass. Merging
test specifications or hardening fixes is not proof of production readiness.

## Checks actually performed (remote GitHub/Supabase)
- GitHub source and onboarding routes inspected against current `main`.
- Six rollback-only SQL suites passed against the connected Supabase project:
  `firm_practice_services.sql`, `firm_bulk_client_profiles.sql`,
  `firm_onboarding_automation.sql`, `firm_onboarding_workload.sql`,
  `firm_onboarding_manager_escalations.sql`,
  `firm_onboarding_reporting_trends.sql`.
- Three pg_cron onboarding jobs are registered and active:
  - `linkbooks-firm-onboarding-reminders` at 01:25 UTC.
  - `linkbooks-firm-onboarding-manager-escalations` at 01:35 UTC.
  - `linkbooks-firm-onboarding-daily-snapshots` at 01:45 UTC.
- At the time of review, `cron.job_run_details` returned **zero** actual
  invocations for these jobs; the snapshot table was still empty.
  This is **not** a successful scheduled-delivery verification.
- CSV operations revalidate current RLS-scoped client/staff access before
  download. An additional frontend safeguard now cancels an in-flight
  export if the selected firm changes or the page unmounts.

## Single-command local release evidence runner

After pulling a clean `main`, run. The verifier itself refreshes
`origin/main` from the authoritative GitHub remote both **before and
after** the checks. If that fetch fails, or `main` changes during the run,
release source acceptance is blocked. Git fetch does **not** run GitHub CI.

```powershell
cd D:\MyApp\StreakBooks
node --test scripts/lib/firm-onboarding-release-plan.test.mjs
node scripts/verify-firm-onboarding-release.mjs

# After provisioning a *dedicated* staging host and setting the environment
# variables documented below, add the staging-only Playwright suite:
# node scripts/verify-firm-onboarding-release.mjs --skip-install --staging
```

The runner **refuses to run checks or issue passing source evidence** if
the checkout is not clean `main`, the origin is not the authoritative
`streakbooks/StreakBooks` GitHub repository, or local HEAD does not
match the fetched `origin/main` commit. It rechecks the working tree after
all test commands. Pull the latest main first (the script does not fetch).

The runner executes `npm ci`, typecheck, lint, lookup/navigation checks,
repository hygiene, eight onboarding Vitest files, build and bundle checks.
It produces local JSON evidence at
`artifacts/firm-onboarding-local-release-YYYY-MM-DDTHH-MM-SS-sssZ-<commit>.json`.
Each invocation uses a unique timestamp and commit hash in the filename,
so dry runs and subsequent executions do not overwrite prior release evidence.
The script refuses to accept a dirty, detached, non-`main`, stale
`origin/main`, or unauthorized Git remote; it rechecks the working tree
after executing tests. All eight prescribed onboarding Vitest suites must
report passed files, with no skipped or failed tests, for local release
acceptance. Dedicated staging must also report **exactly six passed
Playwright tests with zero failures, skips, flaky cases, interrupted
cases, or tests not run**. A Playwright exit code of zero alone
is not accepted if any expected security test was filtered out.

The report is deliberately **never** labeled production-ready: Vercel
deployment, real cron executions and human staging acceptance require separate
evidence. Generated evidence is ignored by Git.

All commands are local. **No GitHub Actions CI workflows are triggered.**
Passing this runner does not by itself complete Batch 4.

## Local PowerShell release commands (manual execution)

```powershell
cd D:\MyApp\StreakBooks
git status
if (git status --porcelain) { throw "Save or stash local changes before pulling." }
git switch main
git pull --ff-only origin main
git log -1 --oneline

# 'npm ci' is local installation, not GitHub Actions CI.
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run check:lookups
npm.cmd run check:navigation
npm.cmd run check:repository
npm.cmd run build

# Run the actual onboarding-related Vitest suites locally:
npm.cmd test -- src/lib/firm/client-portfolio.test.ts src/lib/firm/firm-workflows.functions.test.ts src/lib/firm/onboarding-insights.test.ts src/lib/firm/firm-onboarding-workload.test.ts src/lib/firm/firm-onboarding-workload.functions.test.ts src/lib/firm/firm-onboarding-escalations.functions.test.ts src/lib/firm/firm-onboarding-reporting.test.ts src/lib/firm/firm-onboarding-trends.functions.test.ts

npm.cmd run dev
```

Open `http://localhost:8080` → Firm & Clients → Onboarding. Test:
- Firm/client and staff dropdowns, notes, assignments and prerequisites.
- Custom onboarding template due dates and reminders, preserving prior evidence.
- Completion ordering, blocked and reopened states.
- Workload capacity and overdue manager escalations (opt-in).
- Overdue-age filters, responsive layout, all authorized CSV exports.
- Non-admin user and revoked accounting.view + client link access.
- Verify no cross-firm data is retained on switching firms.

## Dedicated staging-only E2E tests (read-only)

The file `e2e/firm-onboarding-release.staging.spec.ts` uses existing
`scripts/lib/staging-target.mjs` to **fail closed** unless the configured
host is dedicated staging and is explicitly different from production.
It tests frontend smoke, keyboard/mobile, accessibility, and (with
optional fixtures) formula-safe CSV and cross-user isolation.

Configure a dedicated staging firm, a linked staging client with
onboarding tasks, and authorized staging credentials. In your terminal
session, set the following environment variables (do not commit secrets):

```powershell
$env:E2E_STAGING_ENABLED="true"
$env:E2E_FIRM_ONBOARDING_ENABLED="true"
$env:E2E_BASE_URL="https://your-dedicated-staging-host.example"
$env:E2E_EXPECTED_STAGING_HOST="your-dedicated-staging-host.example"
$env:E2E_PRODUCTION_URL="https://your-production-host.example"
$env:E2E_EMAIL="<dedicated-staging-account-email>"
$env:E2E_PASSWORD="<dedicated-staging-account-password>"

# Required for the complete release acceptance suite:
# Create this staging-only private task, beginning =, +, - or @.
# Confirm that the task is visible to the authorized primary staging account.
$env:E2E_FIRM_TASK_CSV_CANARY="=SUM(1,1)"

# Required: second member of the SAME practice who cannot view that
# task's client. Credentials must be distinct from the primary account.
$env:E2E_FIRM_RESTRICTED_EMAIL="<restricted-staging-email>"
$env:E2E_FIRM_RESTRICTED_PASSWORD="<restricted-staging-password>"

npm.cmd run test:e2e -- e2e/firm-onboarding-release.staging.spec.ts
```

Do not set `E2E_BASE_URL` to production or run the staging smoke suite
with real client/customer data. Run only on isolated test accounts.

The staging release runner now fails closed if the CSV canary or second
restricted account is absent, so optional test skips cannot be mistaken
for release acceptance. Its JSON output reports successful local checks,
but **never** marks production readiness without independent evidence.

## Production release evidence (not yet obtained)

The release decision remains **BLOCKED** until the following are
individually recorded as actual observations:
- Unit/integration tests, TypeScript, lint, lookup/navigation checks,
  repository hygiene and production build exit successfully.
- The staging-only Playwright suite passes with seeded accounts;
  optional CSV and second-user gates also pass with their fixtures.
- Staging and production deploy commit SHAs are checked explicitly;
  Vercel deployment/health checks are verified using an authorized
  account or connector, not inferred from a GitHub merge.
- A scheduled cron invocation is observed in `cron.job_run_details`
  with `status='succeeded'`; valid delivery behavior and absence of
  unauthorized/duplicate notifications are checked in the notification
  inbox and database.
- Regression evidence is reviewed on both desktop and mobile with
  firm admins, members and an access-revoked client.

## GitHub CI
**Not run (per owner instruction).** Local `npm ci` is package installation,
not GitHub CI, and local test suites do not require GitHub Actions.
