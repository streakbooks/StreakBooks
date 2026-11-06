# LinkBooks Smart Action Center — final development-batch release gates

## Decision and scope

The ten planned feature-development batches cover the Smart Action Center frontend,
backend notifications, server-filtered history, access-control integration, grouping,
bulk-change recovery, search performance, cursor pagination, and release fixtures.
**Committing a batch does not approve production release.**

Authoritative repository: https://github.com/linkbusinessadvisory/LinkBooks.
Do not use the retired `rohitmehra86/LinkBooks` repository for release verification.

## Verified evidence (2026-11-06)

- The database view `action_notification_inbox` is `security_invoker=true` and
  its underlying notification table has RLS enabled.
- Anonymous sessions have no inbox SELECT or workload EXECUTE privilege.
- A no-identity session under the authenticated database role returns no inbox rows
  and the notification state RPC refuses the request.
- The `action_notifications_search_trgm_idx` index is deployed. A query plan
  confirms PostgreSQL can select the index when sequential scans are disabled.
- A synthetic 10,000-row, read-only SQL cursor test passes across a simulated
  insertion before the cursor. **This is not a load/latency benchmark**.
- At inspection time, the connected Vercel `linkbooks` project's only READY
  production deployment identified the former `rohitmehra86/LinkBooks` repository,
  source commit `36c52456966d0d041ba7abef60a2023004fe6ded`. It does
  **not** demonstrate deployment of the current repository.

## Required local and staging verification — not yet completed

Run locally in PowerShell at `D:\MyApp\LinkBooks`, preserving uncommitted work:

```powershell
git status
git switch main
git pull --ff-only origin main
npm.cmd ci
npm.cmd run typecheck
npm.cmd test -- src/lib/notifications/notification-cursor.test.ts src/lib/notifications/bulk-actions.test.ts src/lib/notifications/notification-utils.test.ts
npm.cmd run lint
npm.cmd run build
```

Run the read-only SQL checks using a dedicated staging database and `psql`
with stop-on-error: `tests/integration/action-center-search-security.sql` and
`tests/integration/action-center-cursor-readonly.sql`.

For authenticated browser verification, configure the following securely as
environment variables; **never commit credentials or test user tokens**:

- `E2E_STAGING_ENABLED=true`
- `E2E_BASE_URL`: approved non-production LinkBooks staging URL
- `E2E_EXPECTED_STAGING_HOST`: exact staging hostname
- `E2E_PRODUCTION_URL`: real production URL (staging target safety check)
- `E2E_EMAIL` and `E2E_PASSWORD`: primary dedicated staging user
- `E2E_ACTION_SECONDARY_EMAIL` and `E2E_ACTION_SECONDARY_PASSWORD`:
  second dedicated user with no permission to see the canary
- `E2E_ACTION_PRIVATE_CANARY`: unique, pre-seeded private notification
  title or body that primary can see, and secondary must not see (at least 16 characters)
- `E2E_ACTION_LARGE_HISTORY=true` only after seeding **over 100**
  accessible notifications in the primary user's staging organisation

Run selectively:

```powershell
npm.cmd run test:e2e -- e2e/action-center-release.staging.spec.ts
npm.cmd run test:e2e -- e2e/staging-smoke.spec.ts
```

The cross-user and large-history tests skip explicitly if the required staging
fixtures are absent. **Skipped tests are not passed tests.** Accessibility scans
check serious and critical violations scoped to the module, not every application screen.


## Automated release metadata guard (read-only)

A production deployment marked `READY` is not sufficient: its actual Git
repository, branch and full source commit SHA must match the approved build.

On a reviewed **fresh, authentic Vercel deployment record** exported as a single
JSON object, run:

```powershell
node --test scripts/lib/action-center-release-gate.test.mjs
node scripts/check-action-center-release.mjs .\vercel-deployment.json <approved-main-40-char-sha>
```

The metadata guard fails closed when the record lacks Git metadata, targets
the old `rohitmehra86/LinkBooks` repository, is not from `main`, identifies
a different commit, targets preview, or is not `READY`. It performs **no**
deployment and requires no API credentials. A saved JSON file is not live
evidence by itself: confirm its deployment ID, environment and commit directly
with the connected Vercel project before release approval. Do not commit
deployment records containing other confidential metadata.

## Required production deployment verification

1. Confirm Vercel project Git source is `linkbusinessadvisory/LinkBooks` before any deployment.
2. Establish the exact candidate `main` commit and a passing full test/build report.
3. Verify all committed Supabase migrations against the target staging and production schemas.
4. Use an approved staging deployment first; test with real authenticated accounts.
5. After explicit release approval, verify a READY production deployment whose
   `githubOrg`, `githubRepo`, and `githubCommitSha` match the authoritative
   repository and approved source commit. A Vercel READY state alone is insufficient.
6. Conduct desktop, tablet, mobile and keyboard QA. Test read/archive/restore,
   disabled preference rules, malformed links, cross-user/tenant reads,
   page changes during concurrent inserts, and partial bulk failure/retry.
7. Capture the production deployment URL, commit, integration test results,
   monitoring and rollback plan in the final release report.

## Unresolved blockers

- The connected Vercel project's last verified production deployment targets the old repository.
- Full app unit/integration, TypeScript, ESLint and build results are not available.
- Authenticated two-user/two-tenant staging tests and browser accessibility checks
  are not yet executed.
- Realistic large-data and end-to-end latency benchmarks are not yet executed.
- Deployment of the current `main` commit and production smoke tests are not verified.

**Release decision: NOT READY for production sign-off.**
