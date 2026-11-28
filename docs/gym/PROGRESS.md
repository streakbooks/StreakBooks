# Gym & Fitness progress

Status words mean:

- Verified: a unit test or the isolated Postgres suite has exercised the behaviour.
- Implemented: the screen and database function exist. Browser proof is still open.
- Not connected: the product does not pretend the integration works.

| Batch | Scope | Status |
| --- | --- | --- |
| 1–2 | Repository fit and capability notes | Implemented |
| 3–4 | Schema, permissions, activation | Verified in isolated Postgres |
| 5 | Navigation | Implemented, route inventory updated |
| 6–10 | Members, plans, lifecycle, renewal | Verified in isolated Postgres: freeze shifts dates and posts nothing, reactivation, renewal without a duplicate, keep-deferred, bank refund, and forfeit |
| 11–15 | Invoices, receipts, recognition, statements | Verified for the annual 120000 example, receipt, one recognition, retry, statement totals, and a locked period refusing a receipt |
| 16 | Vouchers | Verified: redemption reduces an open charge and the liability |
| 17–19 | Appointments, classes, attendance | Verified for overlap, waitlist promotion and check-in |
| 20–21 | Trainers, packages, commission | Verified for session liability and one commission approval journal. A second approval does not post. |
| 22–26 | Payroll, inventory, CRM campaigns | Not connected. Links point at the existing modules. |
| 27–28 | Branches and budgets | Budget upsert verified in isolated Postgres. A repeated line updates in place and posts no journal. |
| 29 | Member portal | Verified: a linked sign-in sees only that member. An administrator can link a sign-in that already belongs to the organisation. |
| 30–31 | Messaging providers and predictive models | Not connected. Churn text is withheld below five opening memberships. |
| 32–33 | Actions, dashboard, reports | Implemented from stored rows. Financial statements stay in Reports. |
| 34–41 | Localisation proof, hosted migration, production release | Not started |

Production readiness: not ready. The hosted database has not had this migration applied. Card acquiring, inventory, payroll, SMS, and authenticated browser coverage are not verified.

## Verification recorded with this batch

Recorded on 2026-11-28 in `D:\StreakBooks-Cursor` on `feature/gym-fitness-management`, before any hosted migration:

- `npx vitest run src/lib/gym src/lib/access-catalogue.test.ts` — 3 files, 23 tests passed.
- `npx tsc --noEmit` — exit 0.
- `npm run check:modules`, `check:navigation`, `check:ui`, `check:browsing-coverage`, `check:visual-coverage` — passed. Inventory checks do not establish runtime behaviour.
- `npm run test:gym:postgres` — disposable Postgres 17, network none. Passed, including annual deferral of 120000, one recognition of 10000, recognition retry, statement totals, session liability, class waitlist promotion, check-in, gateway refusal, keep-deferred cancellation, disable keeps journals, budget upsert without a journal, cross-organisation denial, and dashboard recognised revenue from rows.

Hosted Supabase project `qugoaaizclvkzesptovm` was not migrated by this work. Authenticated browser coverage was not run. Port 8081 was already in use and was left alone.

GitHub: pull request https://github.com/streakbooks/StreakBooks/pull/113. Not merged. The first Actions run of `validate` failed on Prettier in the gym files (299 formatting errors, 0 other lint findings). After formatting, `validate` failed because navigation coverage still expected 31 sidebar modules and settings coverage had no gym record. The next run failed `check:bundle` at 1,051,314 raw bytes against a 1,050,000 budget. The shell now loads only the gym section keys; labels stay with the gym screen. A local production build then measured 1,049,432 raw bytes and 305,879 gzip bytes. Postgres jobs and browser-fixtures passed. Vercel preview deployments completed. The Cloudflare Workers Builds check failed in the same second it started and returned no build log. Supabase Preview was skipped because preview branches are disabled. Production readiness remains not ready.
