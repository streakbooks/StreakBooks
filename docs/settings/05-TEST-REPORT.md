# Settings overhaul test report

**Date:** 2026-11-26
**Validated code revision:** `b2c1ce871a3f56f0d34b118f9fdea286f1c2d0b6` on `feat/settings-module-overhaul`; the follow-on Profile breadcrumb edit passes changed-file ESLint and the focused settings test set.
**Pull request:** [#92](https://github.com/streakbooks/StreakBooks/pull/92), draft; published head `b2c1ce871a3f56f0d34b118f9fdea286f1c2d0b6`.
**Scope:** Settings route, field coverage/search, and the Batch 2 organisation identity/tax transactional save.

## Results

| Check                            | Result                     | Evidence / limit                                                                                                                                                                                                   |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript                       | **Pass**                   | `npm.cmd run typecheck` exited 0 on the current implementation.                                                                                                                                                    |
| Full unit suite                  | **Pass**                   | `npm.cmd test -- --maxWorkers=4`: 633 test files, 4,349 tests passed on this local continuation.                                                                                                                   |
| Focused Settings/company tests   | **Pass**                   | 27 files and 225 tests passed, including all Settings tests and company input validation.                                                                                                                          |
| Changed-file ESLint              | **Pass**                   | ESLint passed for changed TS/TSX/MJS files with zero warnings.                                                                                                                                                      |
| Full repository ESLint           | **Pass**                   | `npm.cmd run lint -- --max-warnings=0` exited 0. The preceding feature-branch commit formatted 143 existing TypeScript/TSX/MJS files; no rules were disabled.                                                       |
| Navigation source audit          | **Pass**                   | `npm.cmd run check:navigation`: 23 files and 11 reporting tabs.                                                                                                                                                    |
| Shared lookup architecture       | **Pass**                   | `npm.cmd run check:lookups`: 418 shared lookup declarations and 0 violations after replacing dynamic staff options with `RecordLookupSelect` and marking fixed enums.                                                  |
| UI contract                      | **Pass**                   | `npm.cmd run check:ui`: 773 TSX files, 0 route definitions, 0 violations.                                                                                                                                          |
| Module checks                    | **Pass**                   | `npm.cmd run check:modules`: permissions, 35 modules, 30 sidebar modules, workspace adoption, empty states and retry states passed.                                                                                |
| Client bundle                    | **Pass**                   | `npm.cmd run check:bundle`: 62 modules, 1,002,662 bytes; 295,719 gzip bytes.                                                                                                                                       |
| All-module browsing inventory    | **Pass**                   | `npm.cmd run check:browsing-coverage`: 30 sidebar modules, 169 authenticated route files, 1 public route file, 15 supporting routes. Inventory-only; 0 modules are fully verified.                                  |
| Production build                 | **Pass**                   | `npm.cmd run build` exited 0 and generated `.vercel/output/nitro.json`. Nitro emitted deprecated `inputValidator` notices and Windows symlink warnings during dependency tracing.                                   |
| Settings Playwright              | **Skipped**                | Three tests exist in `e2e/settings-navigation.spec.ts`; all were skipped because `E2E_EMAIL` and `E2E_PASSWORD` are not configured.                                                                                |
| Browser review                   | **Blocked / unverified**   | The IAB could not connect to `http://localhost:8080`; the browser showed connection refused. No app runtime exception was confirmed.                                                                                |
| Database integration / migration | **CI passed; hosted pending** | The isolated PostgreSQL workflow suite passed on head `b2c1ce871a3f56f0d34b118f9fdea286f1c2d0b6`, including the atomic identity/tax regression. Local Docker/psql/Supabase CLI are unavailable. Migration is unapplied to hosted Supabase. |
| Deployment / production          | **Not performed**          | No Vercel deployment, authenticated staging verification, or production verification.                                                                                                                              |
| GitHub PR checks                 | **Partial / in progress** | [Run #45807731340](https://github.com/streakbooks/StreakBooks/actions/runs/45807731340): all five PostgreSQL jobs and browser fixtures passed; validate was still running at last check. Cloudflare Workers failed externally and Vercel checks report the private-organization Hobby-plan restriction. Supabase Preview was skipped because no Supabase branch is associated with the PR. |

## Corrections made to enable deterministic tests

- Renamed eight committed voice-audio fixtures to match the existing StreakBooks fixture generator/test names; audio contents were not changed.
- Updated the platform authorization test to accept its explicit `platform_role()` allowlist guard while continuing to reject unguarded security-definer functions.
- Normalized CRLF when comparing the generated OpenAPI document so the equality check works on Windows and LF platforms.

## Required follow-up

1. The new identity/tax atomic-save SQL regression passed in GitHub's isolated PostgreSQL job. Local rerun remains unavailable because Docker is absent.
2. Re-run the Settings Playwright cases with a dedicated authenticated test organisation and diagnose the local `/settings` runtime error.
3. Complete unchecked batches in `TASKS.md`; the current coverage matrix deliberately leaves unproven fields partial and read-only.
4. Finish the remaining Settings batches and review all checks on the newest head. Do not merge while implementation batches, authenticated browser verification, or real release failures remain. The standing billing exception applies only when billing prevented jobs from starting; it does not waive real failures or unfinished work.
5. Apply the migration only after target-specific backup evidence is confirmed for configured project `qugoaaizclvkzesptovm`; no hosted migration was applied.

## 2026-11-26 local continuation

This continuation adds read-only handling for unenforced accounting warning/automation preferences and makes the PostgreSQL test harness compatible with the local Windows Docker Desktop context.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Isolated PostgreSQL workflow regressions | **Pass** | `npm.cmd run test:workflows:postgres` completed successfully using an ephemeral network-disabled PostgreSQL 17 Docker container. Atomicity/rollback, permissions, two-tenant RLS, purchase/sales lifecycles, balanced journals and locks, and guarded demo reset passed. The harness cleaned up its container. No hosted database was used. |
| Focused Settings tests | **Pass** | 3 files, 14 tests passed: accounting preferences, read-only accounting safeguards, and capability registry. |
| Changed-file ESLint | **Pass** | ESLint completed successfully on changed TS/TSX/MJS files. |
| Module/UI/navigation checks | **Pass** | `check:modules`, `check:ui` (774 TSX files, zero violations), and `check:navigation` (23 files, 11 tabs) passed. |
| TypeScript validation | **Pass** | `npm.cmd run typecheck` exited 0 on this local continuation. |
| Full unit suite | **Pass** | `npm.cmd test -- --maxWorkers=4`: 634 test files, 4,350 tests passed on this local continuation. |
| Full repository ESLint | **Pass** | `npm.cmd run lint -- --max-warnings=0` exited 0 with no warnings. |
| TanStack server-function API | **Pass (tests/typecheck)** | Replaced 1,212 deprecated `.inputValidator()` calls with `.validator()` and updated 50 server-function mocks. The migration guide specifies `.validator()` uses the same validator. |
| Production build after API cleanup | **Pass** | `npm.cmd run build` exited 0 and generated `.vercel/output/nitro.json`. No deprecated `inputValidator` notices or symlink permission errors remain. The shared Vite config still injects `vite-tsconfig-paths`, leaving one Vite 8 advisory. |
| Browser verification at port 8080 | **Unverified** | A Vite listener already occupies 8080; an HTTP request timed out, and a second server cannot start with `--strictPort`. No 8081 browser was opened. |
| Hosted Supabase / migrations | **Not performed** | No hosted project was accessed or changed. The isolated harness only loaded the identity/tax migration and workflow test fixtures into its disposable local database. |
| GitHub / deployment | **Pending** | These local changes are not yet committed or pushed. PR #92 remains draft and unmerged. No deployment was attempted. |
