# Nonprofit Management progress

Status: **not production ready**.

Updated after the fund-accounting foundation. Percentages count verified milestones in this file. A written screen without a passing check stays at zero for that milestone.

## Batch position

| State | Batches |
| --- | --- |
| Total | 33 |
| Verified core complete | 7 (batches 1–7) |
| In progress | 8–14 |
| Not started as a batch | 15–33 |
| Blocked | none inside this worktree |

Overall completion: 7 / 33 verified batches = **21%**.

```
Repository audit            [##########] 100%
Frontend development        [####......]  40%
Backend development         [####......]  40%
Supabase database           [####......]  40%
Fund accounting             [######....]  60%
Donor management            [##........]  20%
Donation management         [###.......]  30%
Grant management            [####......]  40%
Fundraising                 [#.........]  10%
Programme management        [#.........]  10%
Accounting integration      [#####.....]  50%
Reports and analytics       [#.........]  10%
Portals                     [#.........]  10%
Automation                  [#.........]  10%
Security and permissions    [####......]  40%
Database migration checks   [####......]  40%
Unit testing                [####......]  40%
Integration testing         [#####.....]  50%
Authenticated browser tests [..........]   0%
GitHub CI                   [..........]   0%
Main branch merge           [..........]   0%
Supabase deployment         [..........]   0%
Vercel deployment           [..........]   0%
Overall production readiness [##........]  21%
```

Frontend, backend and database percentages count the working subset that has code plus a passing local check. They are not a claim that all 41 submodules exist.

## Verified milestones

- Independent worktree `D:\StreakBooks-Cursor-Nonprofit` on `feature/nonprofit-management`. Codex worktrees were not modified.
- Migration versions `20261128220000` and `20261128221000` sit after open pull-request versions `20261128120000` and `20261128130000`.
- Disposable PostgreSQL 17 applied the fixture and both migrations, then passed `tests/integration/nonprofit-fund-accounting.sql`.
- The same run proved one concurrent donation with idempotency key `race-1` posted one journal.
- Vitest: 9 files, 39 tests, 0 failed, for nonprofit planners, permissions, compliance wording, gateway signatures, insights, the module registry and the access catalogue.
- `tsc --noEmit` passed.
- `check:modules`, `check:navigation`, `check:ui`, `check:browsing-coverage` and `check:visual-coverage` passed.
- ESLint with Prettier passed on the nonprofit files and the navigation, permission and registry edits.
- `vite build` passed in this worktree. The output is local only and was not deployed.

## Not verified

- Authenticated browser use. Opening `http://localhost:8082/nonprofit` on 28 November 2026 showed Vite's error page. The dev server could not load Nitro's dev entry through the `node_modules` junction to `D:\StreakBooks\node_modules`. No organisation, form or journal was exercised in the browser.
- Authenticated use of the built application. The production build completed locally and was not deployed.
- GitHub Actions.
- Hosted Supabase.
- Vercel.
- Upgrade of an existing production database.

## Coordinates

| Item | Value |
| --- | --- |
| Branch | `feature/nonprofit-management` |
| Worktree | `D:\StreakBooks-Cursor-Nonprofit` |
| Foundation commit | `78a75df32294a486f254091a93bab56429f6d385` |
| Pull request | https://github.com/streakbooks/StreakBooks/pull/101 |
| GitHub CI | not verified in this note |
| Merge | not merged |
| Latest observed `origin/main` | `0f6d5a86ce0648a30aa8ef13842d1fb268f581b6` at isolation; re-check before push |
| Supabase development | disposable Docker PostgreSQL 17 only |
| Supabase migration status | files present; not applied to a hosted project |
| Supabase production | not deployed |
| Vercel preview | not deployed |
| Vercel production | not deployed |
| Tests executed | Vitest 39; PostgreSQL integration suite 1 run, passed, including the concurrent replay |
| Tests failed | 0 in the last Vitest run and the last PostgreSQL run |
| Outstanding defects | none recorded from those runs |
| Current blocker | none for continued local development |
| Next batch | Donor and donation depth: split-fund entry in the screen, receipt viewing, and the remaining donation methods already accepted by the database |

## Scenario coverage in the PostgreSQL suite

Covered: fund close at zero, split donation with a fee, idempotent replay, restricted revenue rather than a liability, per-fund balance, stored foreign-exchange rate, donated services not recognised, conditional grant advance, ineligible grant spend rejected, partial recognition, eligible spend, conditional pledge, pledge collection, refund with chargeback fee, organisation and fund balance, smart-action pledge, beneficiary visibility, locked period, cross-tenant denial, portal isolation, duplicate gateway event, concurrent post.

Not covered by that suite: donated inventory distribution, donated fixed-asset journal, depreciation, payroll accrual, investment income, pledge impairment, a foreign-exchange settlement journal, shared expense allocation, and historical as-at statements.
