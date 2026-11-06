# LinkBooks — Accounting Reconciliation Release Readiness (Batch 6 / 6)

**Evidence date:** 2026-11-06.
**Scope:** Accounting Reconciliation Exception Centre, Fixed Assets posting audits, and persistent/independent review cases.
**Repository:** \`linkbusinessadvisory/LinkBooks\`.
**Release verdict:** **BLOCKED — DO NOT LABEL PRODUCTION-READY.**
**GitHub CI:** NOT RUN, per user instruction.

## Verified observations in this development session

1. Confirmed merged PRs #140 (Fixed Assets posting evidence), #142 (read-only APIs), #145 (exception UI), #148 (persistent review), and #150 (independent review) on \`main\` before Batch 6 work.
2. The **connected LinkBooks Supabase project is not labelled staging**. Only a LinkBooks project and an unrelated LeadOrbit project were available. Neither should be used as an assumed staging test target.
3. **Read-only SQL introspection** of connected LinkBooks showed:
   - \`public.reconciliation_review_cases\`: absent.
   - \`public.reconciliation_review_events\`: absent.
   - \`public.save_reconciliation_review_case(...)\`: absent.
   - \`public.progress_reconciliation_review_case(...)\`: absent.
   - Migration versions \`20261106233000\` and \`20261106234500\`: absent from migration history.
   - Existing prerequisite functions \`private.mfa_requirement_met()\`, \`public.is_company_member(uuid)\`, \`public.has_company_permission(uuid,text)\` and tables \`public.role_permissions\`, \`public.member_permission_adjustments\`, \`public.company_members\`, and \`public.journals\` are present.
4. A repository checkout at \`D:\MyApp\LinkBooks\` was not mounted here. A direct container clone could not resolve github.com. **Full npm Vitest/typecheck/lint/build/Playwright execution has not occurred.** Vercel staging/production deployment was not verified.
5. Source-derived standalone execution of the new release-plan checks passed **16/16** in an isolated JavaScript evaluator. This does not count as a repository Node test or the 22 focused Vitest suites.
6. The connected project's Supabase security advisor lists pre-existing advisory groups. Their presence does not establish whether the new review migration is secure; rerun advisor and actual RLS tests after staging installation.
7. The parallel Fixed Assets register-to-GL PR #111 remained **open/unmerged** during this session; do not claim its functionality shipped.

## Delivered source / executable local non-CI gate

- \`scripts/lib/accounting-reconciliation-release-plan.mjs\`: release step plan, exact focused test inventory, migration source contract checks, robust Vitest count parser, clean-live-main preflight and fail-closed release verdict.
- \`scripts/lib/accounting-reconciliation-release-plan.test.mjs\`: 16 Node built-in \`node:test\` cases for release evidence and safety (committed; isolated source-derived execution passed; the actual repository Node runner has not been run here).
- \`scripts/verify-accounting-reconciliation-release.mjs\`: local, cross-platform, non-CI verification runner that:
  - requires clean \`main\` at the exact current \`origin/main\` SHA with a read-only fresh fetch;
  - verifies both migration source files and existence of all 22 focused Accounting test files;
  - runs \`npm ci\` (unless \`--skip-install\`), \`npm run typecheck\`, \`npm run lint\`, focused \`npm test -- <22 files>\`, full \`npm run test\`, \`npm run build\` and \`npm run check:bundle\`;
  - refuses to count a zero-exit Vitest command without a valid, passing test summary, and requires all 22 focused files;
  - writes a timestamped JSON report under \`artifacts/accounting-reconciliation-release-*.json\` with actual exit codes, durations, test counts, SHA/digests and blockers — **not** secrets or raw test output;
  - **always returns \`productionReady: false\`**, even if all local checks pass, until separately verified staged SQL/RLS, authenticated browser tests and Vercel evidence exist. It never runs GitHub Actions, applies a DB migration or deploys Vercel.
- \`scripts/accounting-reconciliation-schema-readonly.sql\`: read-only catalog and migration-history queries for staging, to inspect expected tables, RLS, SELECT-only grants, RPC execute grants and both deployed migration versions.

## Operator actions (separate non-CI workflow)

First use \`git status --short\` to check for uncommitted work; protect local modifications rather than discarding them.

\`\`\`powershell
cd D:\MyApp\LinkBooks
git status --short
git switch main
git pull --ff-only origin main

# Test the release gate itself, with Node built-in tests.
node --test scripts/lib/accounting-reconciliation-release-plan.test.mjs

# Inspect planned steps and blockers, WITHOUT executing npm commands.
node scripts/verify-accounting-reconciliation-release.mjs --dry-run

# Run actual non-GitHub-CI verification on clean, latest main.
node scripts/verify-accounting-reconciliation-release.mjs
\`\`\`

### Required staging acceptance, not automated by GitHub merge

1. Establish a **distinct LinkBooks staging Supabase project** with test organisations, users and credentials. Do **not** point destructive reset, seed, RPC mutations or test scripts at the connected LinkBooks project unless it is positively identified as disposable staging.
2. Apply migration \`20261106233000_reconciliation_review_cases.sql\` followed by \`20261106234500_reconciliation_review_signoff.sql\` using normal migration tooling **on staging only**, preserving existing schema and migration history. Do not indiscriminately push all other outstanding migrations from a workspace.
3. Run \`scripts/accounting-reconciliation-schema-readonly.sql\` on staging and confirm both migrations, both RLS-protected tables, SELECT-only client grants, and correct RPC grants.
4. Exercise authenticated RLS with at least two unrelated organisations; test no accounting.view, no accounting.post, missing MFA, cross-tenant source/journal IDs and denied member role adjustments.
5. Simulate simultaneous versioned updates and failed sign-offs: creator != reviewer, submitter != reviewer, assigned active reviewer required. Confirm the old Batch 4 RPC cannot bypass Batch 5 stage guards.
6. Run the full audit workflow with staged seeded GL and Fixed Assets data, including reversed or mismatched depreciation and disposal journals. Confirm \`reviewed\` is not \`resolved\` and does not mark an exception as cleared.
7. Run browser and UI accessibility checks, CSV formula escaping, operational status persistence, event history >100 disclosure and secure evidence links.
8. Review Supabase advisor findings following migration, validate Vercel staging deployment, then separately approve production migration and deployment with rollback/backups.
9. **GitHub CI remains disabled**. Use the local release runner and actual manual/staging evidence, not a green PR badge.

## Status rules

A **source-implemented/merged** batch cannot count as *fully tested*, *staging migrated*, or *deployed*. It is appropriate to report six coding batches merged once this PR lands, but **zero fully verified production releases** until the external gates pass. Mark this Batch 6 release verification as **partial / blocked**, not complete, if full tests and staging acceptance are still absent.
