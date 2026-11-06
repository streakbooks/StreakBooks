# LinkBooks Budgets — Batch 10 Release Acceptance Plan

**Scope:** Budgets editor, duplication, locking, revisions, approval,
atomic saving, Class/Department/Location allocations, dimension actuals,
scenario comparison, and forecasting.

**Release state:** NOT PRODUCTION READY until every required gate has
reproducible, dated evidence. A source commit or added test is not a passed test.
Do not manually launch GitHub Actions CI unless approved.

## Source of truth

- Repository: `linkbusinessadvisory/LinkBooks`, branch `main`
- Database: connected LinkBooks Supabase project
- Run tests on a **disposable/local or approved staging database**, not the
  connected production project.
- Creating a new hosted Supabase development branch may incur charges and must
  be approved before creation.

## Migration inventory and required order

The base migration `20261025400100_budgets.sql` is already present in the
connected database. Review and replay these **seven** subsequent migrations,
in ascending timestamp order, on the test database:

1. `20261106115500_duplicate_budget.sql`
2. `20261106173000_budget_governance_revisions.sql`
3. `20261106182000_budget_atomic_document_save.sql`
4. `20261106193000_budget_approval_workflows.sql`
5. `20261106204000_budget_dimension_allocations.sql`
6. `20261106214000_budget_forecast_scenarios.sql`
7. `20261106224500_budget_release_grants_hardening.sql`

Do not mark a migration deployed just because its SQL is committed. Retain
migration history, capture failure output, and verify backups/restore before
production deployment. The governance migration previously contained a
malformed dollar-quote delimiter; the checked-in correction is required.

## Gate A — Static source and build

On a **clean** checked-out `main`:

```powershell
cd D:\MyApp\LinkBooks
git status
git pull --ff-only origin main
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/budgets
npm.cmd run build
```

Record test counts, failing assertions, TypeScript and ESLint messages,
build artifact checks and commit SHA. No pass may be inferred without logs.

## Gate B — Database and grants

- Execute the seven pending migrations in version order on a test database.
- Run `tests/integration/budget-release-readiness.sql` as a **read-only**
  check. **All 20 rows must report `is_ready = true`.**
- Confirm SQL functions require a signed-in user and permission for the
  requested organisation.
- Confirm direct `INSERT`, `UPDATE`, and `DELETE` grants are absent
  from `anon` and `authenticated` on all ten relevant budget tables.
- Confirm all ten tables enable RLS and tenant-scoped SELECT policies.
- Confirm SECURITY DEFINER functions have restricted invocation and safe
  search paths.
- Inspect Supabase security/performance advisors, document actionable lints.
- Repeat migration replay on fresh database after any corrections.

## Gate C — Real two-tenant and role tests

Create **synthetic** Organisation A and Organisation B fixtures. Test with
independent authenticated sessions (not service-role bypass). Verify:

- A member cannot list, view, edit, duplicate, delete or export B budgets.
- A viewer cannot call management RPCs; an authorised manager can.
- An unauthenticated request cannot call privileged functions.
- RLS filters rows across budgets, revisions, approvals, tracking allocations,
  forecasting scenarios and audit events.
- SQL direct writes fail under `authenticated` even with known UUIDs.
- The MFA `mfa_aal2_required` restrictive policies do not accidentally
  block legitimate users or enable unauthorised modifications.

## Gate D — Accounting integrity and concurrency

- Save title + twelve-month amounts atomically; force a validation failure
  and verify **nothing** is partially saved.
- Use two sessions: stale save must fail without overwriting a newer version.
- Lock, then attempt header change, CSV import, line mutation and deletion.
- Submit approval and attempt all prohibited mutations during review.
- Requester must be prevented from self-approving or self-rejecting.
- A different authorised reviewer must approve/reject with audit remarks.
- Verify approved freeze, reopening and a subsequent approval cycle.
- Verify duplicate budgets preserve correct fiscal month alignment.
- Verify dimension allocations cannot exceed each account/month base budget;
  reducing the base budget below existing allocations must fail atomically.
- Verify historical inactive accounts/option values are not silently dropped.
- Reconcile aggregate posted accrual actuals against the general ledger.
- Include debit/credit notes, reversals, foreign currency and year-end closing
  journals in source-of-truth comparisons. Any unsupported dimension
  attribution must be disclosed explicitly.
- Forecast calculations must use only **completed** actual months and preserve
  the main budget and posted journals. Test run rate, scenario copy, save,
  concurrent update, deletion and audit history.

## Gate E — Authenticated browser and accessibility

Use real non-service-role sessions. Review desktop/tablet/mobile:

- Navigation, search, filters, saves, cancel, unsaved-change protections.
- Amount input, annual distribution, partial-year handling, pagination,
  long account lists, CSV injection guards and downloadable filenames.
- Keyboard-only control navigation, focus, labels, errors and colour contrast.
- Rapid navigation, back/forward, offline/timeout recovery and tenant switching.
- Different fiscal-year starts and base currencies.

## Gate F — Deployment and recovery

- Database backup captured; restore tested in isolation.
- Roll-forward and rollback/remediation plans reviewed.
- Confirm staging migration version, application build, runtime logs and
  authenticated smoke tests **after** deployment.
- Confirm Vercel deployment matches authoritative repository and reviewed
  commit. A source commit is not proof of deployment.
- Production release only after explicit recorded sign-off; verify post-release
  audit logs, RLS, exceptions, performance and data reconciliation.

## Reporting evidence (fill only after real execution)

| Gate | Current state | Required evidence |
| --- | --- | --- |
| Source/build/unit | Pending | `typecheck`, Vitest, lint and build logs |
| SQL migration replay | Pending | Fresh staging migration output |
| Privileges + RLS | Pending | All 20 SQL checks and two-tenant results |
| Accounting/concurrency | Pending | Posting and transaction fixture results |
| Browser QA | Pending | Authenticated browser logs/screenshots |
| Deployment/recovery | Pending | Verified staging/production and restore logs |

**Important:** The read-only metadata query may be run on the connected
database. Do not execute DDL, synthetic tenant mutations or migration replay
against the live project as part of this checklist.
