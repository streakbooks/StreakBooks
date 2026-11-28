# Nonprofit Management progress

Status: **not production ready**.

Updated after disbursement approval on `feature/nonprofit-disbursements`. Posting depth is on GitHub main as pull request 103. The foundation is pull request 101. Percentages count verified milestones in this file. A written screen without a passing check stays at zero for that milestone.

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

- Authenticated browser use of the Nonprofit screens. On 28 November 2026, `http://localhost:8081/nonprofit` redirected to the sign-in page and kept `redirect=/nonprofit`. No organisation workflow was signed in.
- Vercel production for `c697e459`. GitHub deployments returned no records. Pull-request previews for 103 and 105 had completed earlier.
- A restore point for project `qugoaaizclvkzesptovm` recorded in this repository. The hosted history was already applied when checked; it was not rebuilt.

## Coordinates

| Item | Value |
| --- | --- |
| Branch | `main` at the hosted check, then this documentation update |
| Worktree | `D:\StreakBooks-Cursor` |
| Foundation merge | https://github.com/streakbooks/StreakBooks/pull/101 |
| Posting-depth merge | https://github.com/streakbooks/StreakBooks/pull/103 |
| Disbursement merge | https://github.com/streakbooks/StreakBooks/pull/105 at `c697e4595e4ef1307e88f0f848609b980235ab60` |
| Latest observed `origin/main` | `c697e4595e4ef1307e88f0f848609b980235ab60` |
| Supabase project | `qugoaaizclvkzesptovm`, StreakBooks, `ap-southeast-2`, production |
| Supabase migration status | 398 local files and 398 hosted versions. Dry run reported the remote database up to date. Nonprofit versions `20261128220000`, `20261128221000`, `20261128233000` and `20261128240000` are present. Codex version `20261128222000` is not. |
| Supabase objects | `nonprofit_funds`, donations and disbursements exist. Submit, movement, request and decide functions exist. `post_journal` remains. 33 nonprofit tables have row-level security. 17 distinct `nonprofit.*` permissions. Anonymous execute is absent. |
| Hosted activity | One settings row is enabled, gateway is not configured, and there are no funds, donations or nonprofit journals. No live rows were inserted during this check. |
| Vercel production | not verified |
| Outstanding product work | recurring charges, public donation pages, live gateways, statutory filing, exports and full portals. The historical statement function is local in `20261128250000` and is not hosted. |
| Current blocker | authenticated browser workflow needs a sign-in; the module is not production ready |

## Scenario coverage in the PostgreSQL suite

Covered: fund close at zero, split donation with a fee, idempotent replay, restricted revenue rather than a liability, per-fund balance, stored foreign-exchange rate, donated services not recognised, conditional grant advance, ineligible grant spend rejected, partial recognition, eligible spend, conditional pledge, pledge collection, refund with chargeback fee, organisation and fund balance, smart-action pledge, beneficiary visibility, locked period, cross-tenant denial, portal isolation, duplicate gateway event, concurrent post.

Also covered on 28 November 2026: donated inventory distribution and its over-distribution rejection, donated fixed-asset journal, depreciation and over-depreciation rejection, payroll accrual, payroll payment and a second payment without a payable, investment income, pledge impairment and an over-impairment rejection, foreign-exchange loss, shared expense allocation and an over-allocation rejection, and spendable as of a date before activity.

Also covered later the same day: disbursement segregation, a posted disbursement, an ineligible beneficiary with no journal, and hidden disbursement rows.

Also covered later the same day: a historical fund statement for a quiet period, the split-donation day, an interfund transfer, a restriction release, the identity of opening plus activity to closing, an inverted period, cross-tenant denial, portal denial, and a viewer reading the report without beneficiary records.

Not covered by that suite: recurring charges. The statement is a management report, not a statutory filing, PDF, or spreadsheet.
