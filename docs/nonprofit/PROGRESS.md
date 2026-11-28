# Nonprofit Management progress

Status: **not production ready**.

Updated after posting-depth work on `feature/nonprofit-posting-depth`. The foundation is on GitHub main as pull request 101. Percentages count verified milestones in this file. A written screen without a passing check stays at zero for that milestone.

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
Fund accounting             [#######...]  70%
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
Integration testing         [######....]  60%
Authenticated browser tests [..........]   0%
GitHub CI                   [######....]  60%
Main branch merge           [######....]  60%
Supabase deployment         [..........]   0%
Vercel deployment           [..........]   0%
Overall production readiness [##........]  21%
```

Frontend, backend and database percentages count the working subset that has code plus a passing local check. They are not a claim that all 41 submodules exist.

## Verified milestones

- Foundation merged to GitHub main by pull request 101 at `51ea59accec84a3c689029afc08b13d98b896b43`. Codex worktrees were not modified.
- Migration versions `20261128220000` and `20261128221000` are on main. `20261128233000` adds posting depth on this branch.
- Disposable PostgreSQL 17 applied the fixture and all three migrations, then passed `tests/integration/nonprofit-fund-accounting.sql`, including the concurrent donation.
- Vitest in `src/lib/nonprofit`: 7 files, 24 tests, 0 failed, on 28 November 2026.
- `tsc --noEmit` passed on this branch.
- ESLint with Prettier passed on the nonprofit function, type and screen files after formatting. Lookup architecture reported 0 violations.
- `check:modules`, `check:navigation`, `check:ui`, `check:browsing-coverage`, `check:visual-coverage` and `vite build` were not re-run for this posting-depth change. They passed on the foundation before pull request 101 merged.

## Not verified

- Authenticated browser use. The earlier attempt on port 8082 failed before any organisation workflow. This checkout was not opened in a browser for the new forms.
- Authenticated browser use of the new movement, impairment and allocation forms.
- Hosted Supabase. This session did not apply SQL. The Supabase CLI is not installed, `C:` had about 0.19 GB free so the CLI download failed with `ENOSPC`, and there is no linked project file in this checkout. No `db push` or remote query was run.
- Vercel production.
- A restore point for project `qugoaaizclvkzesptovm`. Repository notes still have no target-specific backup for that project.

## Coordinates

| Item | Value |
| --- | --- |
| Branch | `feature/nonprofit-posting-depth` |
| Worktree | `D:\StreakBooks-Cursor` |
| Foundation merge | https://github.com/streakbooks/StreakBooks/pull/101 at `51ea59accec84a3c689029afc08b13d98b896b43` |
| Pull request | this posting-depth branch, not opened in this note until the commit exists |
| GitHub CI | pull request 101 validate passed before merge; this branch is not on GitHub yet |
| Merge | foundation only; posting depth is not merged |
| Latest observed `origin/main` | `51ea59accec84a3c689029afc08b13d98b896b43` |
| Supabase development | disposable Docker PostgreSQL 17 only |
| Supabase migration status | three local files; hosted apply not run |
| Supabase production | not deployed |
| Vercel preview | pull request 101 previews succeeded; this branch has no preview yet |
| Vercel production | not verified |
| Tests executed | Vitest 7 files / 24 tests passed; PostgreSQL suite passed on 28 November 2026, including concurrent replay |
| Tests failed | 0 in those two runs |
| Outstanding defects | hosted CLI install blocked by low free space on `C:` |
| Current blocker | hosted migration cannot be applied until the Supabase CLI can run and the project ref is confirmed as `qugoaaizclvkzesptovm` |
| Next batch | Disbursement approval, then free disk space and apply the three migrations with `db query --remote -f` plus `migration repair`, never `db push` |

## Scenario coverage in the PostgreSQL suite

Covered: fund close at zero, split donation with a fee, idempotent replay, restricted revenue rather than a liability, per-fund balance, stored foreign-exchange rate, donated services not recognised, conditional grant advance, ineligible grant spend rejected, partial recognition, eligible spend, conditional pledge, pledge collection, refund with chargeback fee, organisation and fund balance, smart-action pledge, beneficiary visibility, locked period, cross-tenant denial, portal isolation, duplicate gateway event, concurrent post.

Also covered on 28 November 2026: donated inventory distribution and its over-distribution rejection, donated fixed-asset journal, depreciation and over-depreciation rejection, payroll accrual, payroll payment and a second payment without a payable, investment income, pledge impairment and an over-impairment rejection, foreign-exchange loss, shared expense allocation and an over-allocation rejection, and spendable as of a date before activity.

Not covered by that suite: disbursement approval, recurring charges, and a full historical statement pack.
