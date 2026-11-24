# Firm & Clients — Advanced Onboarding Reports and Observed Trends

## What this batch adds
- Operational checklist ageing: not due, 1–7, 8–30, 31–60 and 61+
  overdue days, plus unscheduled and completed tasks.
- Client, assigned-staff, ageing and completion filters; a paginated
  (bounded) current-task overview and drill-through to the client checklist.
- Current staff capacity comparison against advisory limits.
- Daily **observed** client completion, overdue, unassigned and blocked
  snapshot metrics, with 30/60/90 day date windows.
- Two secure CSV exports: filtered operational tasks and daily
  observed trend aggregates. Every CSV text cell is encoded through the
  existing `csvField()` formula-neutralizing and delimiter-escaping helper.

## Security model
`public.firm_onboarding_daily_snapshots` is read-only for authenticated
clients and RLS-enforced. Read access requires firm membership,
`accounting.view` on the individual client, a non-revoked firm-client
link, and MFA. App roles cannot insert, update or delete snapshots,
or execute the capture function. The only writer is the private
database scheduled job. The current-task export uses
`listFirmOnboardingOverview`, which independently applies client RLS;
the UI further intersects with accessible linked client entries.

CSV contains operational titles, assignee names, due dates and
completion statuses, but not client notes or financial balances.
Exports require fully loaded authorized server results and **reissue
the server queries at the moment of download** to recheck the current
session and client access, preventing export from a stale client-side
query cache after access is revoked.
Do not forward exports to recipients who lack client access.

## Snapshot semantics
- The scheduled capture job
  `linkbooks-firm-onboarding-daily-snapshots`
  runs at `45 1 * * *`, using the database's UTC calendar day.
- It captures **one immutable observation per firm, linked client,
  and UTC date**. Re-running the job the same day returns zero new
  records; it does not replace past observations.
- Only linked clients with actual checklist steps produce rows.
- Existing historical days are **not backfilled**: no historical
  completion rate is invented from today's state.
- Historical reporting population may change when clients are linked,
  revoked or their permissions change. A trend percentage is a
  count-weighted calculation across accessible client observations for
  that day; it is not a fixed-cohort comparison.
- Historical observations are per client (not per staff). The staff
  filter affects live task reporting only.
- The server returns at most 5,000 authorized rows for a selected
  30/60/90-day period; large firms should shorten the range.

## Test coverage and release gates
- `supabase/tests/firm_onboarding_reporting_trends.sql`
  exercises count accuracy, immutable daily records, anonymous/DML
  restrictions, MFA, foreign/unlinked tenant isolation, company
  permission revocation, and registered cron scheduling.
- `src/lib/firm/firm-onboarding-reporting.test.ts`
  covers ageing boundaries, scoped filters, formula-safe exports,
  and observed-only trending.
- `src/lib/firm/firm-onboarding-trends.functions.test.ts`
  covers strict period/window validation.
- Scheduled capture's SQL function has passed rollback-only testing;
  **a real scheduled execution has not yet been observed**.
- Unit tests, TypeScript, lint, production build, authenticated E2E,
  mobile responsiveness, Vercel deployment and staging/production
  behavior still require local verification.
- **GitHub CI is not run**, per owner instruction.

## Local verification
```powershell
cd D:\MyApp\StreakBooks
git status
if (git status --porcelain) { throw "Save or stash changes first." }
git switch main
git pull --ff-only origin main
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/firm/firm-onboarding-reporting.test.ts src/lib/firm/firm-onboarding-trends.functions.test.ts
npm.cmd run check:lookups
npm.cmd run build
npm.cmd run dev
```

At `http://localhost:8080` open Firm & Clients → Onboarding:
change client and staff filters, test each ageing band, verify
accessible-only CSV downloads and malicious-formula-safe cell contents,
review the live workload comparison and empty/present daily snapshot
states, and test two firms with revoked access.

## Roadmap tracking
This is Batch 3 of the four-batch **onboarding workload** roadmap.
Batch 4 remains comprehensive local, browser and deployment release
verification, with no GitHub Actions CI. Three merged batches are not
evidence of production readiness.
