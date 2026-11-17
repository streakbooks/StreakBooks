# Batch 2 — register/session foundation (partial implementation)

Continuation of [POS PR #238](https://github.com/linkbusinessadvisory/LinkBooks/pull/238). Adds physical-location register setup, cashier location grants, dedicated POS role permissions, real opening/unchanged-float closing commands and closed-session history. There are no sale/payment/stock/journal mutations. This is not a production-ready POS release.

| Required verification           | Actual status at foundation commit                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task implementation             | Partial: configuration/session foundation implemented                                                                                                  |
| PR                              | #238 continuation; integration update pending                                                                                                          |
| Merge into main                 | POS not merged; unrelated #241 audit repair merged externally                                                                                          |
| Main inspected                  | `fa57d602`; concurrent main work preserved                                                                                                             |
| GitHub CI                       | Blocked before any steps by account billing/spending limit; [actual run](https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44111433825)   |
| Unit tests                      | 99 focused tests passed across 9 files; initial full run had 3,997 passed / 7 failed, with corrective batches isolated for integration                 |
| PostgreSQL integration/security | 45 assertions passed, including 3 real concurrent-operation scenarios; production migration applied unmodified to disposable PG17 master/auth fixtures |
| Browser / E2E                   | 9 passed, isolated services, desktop/tablet/mobile; shared lookups, counts/variance, company switch and error recovery                                 |
| TypeScript                      | Local incremental check passed; final integrated revision still requires rerun                                                                         |
| Production build                | Local build passed before final integration; no deployment                                                                                             |
| ESLint                          | New POS implementation and fixtures passed; broad baseline formatting/type/hook debt repaired in separate branch                                       |
| Lookup contract                 | POS uses shared lookups; remaining baseline architecture violations repaired separately                                                                |
| Supabase migrations             | New POS migration local-fixture tested only; NOT applied to hosted project                                                                             |
| Live read-only audit            | Prerequisite columns confirmed, POS tables absent; advisor summary below                                                                               |
| Authenticated staging           | Not executed                                                                                                                                           |
| Deployment / production         | Not deployed / not verified                                                                                                                            |

Database ownership and security: reuse `hr_locations`, `accounts`, `company_members`, `profiles` and existing audit history. Composite tenant FKs protect register location/account links; RLS and current permission/location checks protect reads. Only private, guarded commands elevate; public RPCs use invoker rights; anonymous execute and direct cashier writes are revoked. Mutable operation IDs cannot alter a prior result, and one register cannot have multiple open sessions. Atomic audit failure rolls back creation/opening/closing. SQL tests cover foreign-register replay and null access actions. An opening float declares existing cash, without inventing an accounting transfer. Closing a variance fails and leaves the session open until a later approved accounting workflow exists.

Connected database audit was read-only: required master columns exist, latest migration metadata includes `20261117220000`, and both POS tables are absent. Security advisors returned 92 informational no-policy notices, 21 search-path warnings, 26 anonymous definer-execute warnings, 726 authenticated definer-execute warnings and one Auth protection warning. These are untriaged platform notices, not verified exploits, and do not describe the unapplied POS migration. No live configuration or data was changed. The local Supabase CLI advisor could not connect because a full local Supabase stack was not running; actual RLS/privilege/concurrency assertions ran against disposable PostgreSQL instead.

## Exact changed paths in this foundation batch

- `docs/pos/README.md`
- `docs/pos/architecture.md`
- `docs/pos/competitors.md`
- `docs/pos/database.md`
- `docs/pos/gap-analysis.md`
- `docs/pos/requirements.csv`
- `docs/pos/security.md`
- `docs/pos/tracker.md`
- `docs/pos/workflows.md`
- `e2e/pos/cart.spec.ts`
- `e2e/pos/fixtures.ts`
- `e2e/pos/main.tsx`
- `e2e/pos/registers.spec.ts`
- `e2e/pos/vite.config.ts`
- `package.json`
- `scripts/check-module-contracts.mjs`
- `scripts/check-module-permissions.mjs`
- `scripts/check-native-navigation.mjs`
- `scripts/test-pos-postgres.mjs`
- `src/components/pos/PosNavigation.tsx`
- `src/lib/access-catalogue.ts`
- `src/lib/ai-voice/deterministic-engine.ts`
- `src/lib/modules/registry.test.ts`
- `src/lib/modules/registry.ts`
- `src/lib/nav-coverage.test.ts`
- `src/lib/nav.ts`
- `src/lib/permissions.ts`
- `src/lib/pos/catalogue-quote.functions.test.ts`
- `src/lib/pos/catalogue-quote.functions.ts`
- `src/lib/pos/register-contracts.test.ts`
- `src/lib/pos/register-contracts.ts`
- `src/lib/pos/registers.functions.test.ts`
- `src/lib/pos/registers.functions.ts`
- `src/routeTree.gen.ts`
- `src/routes/_authenticated/pos/registers.tsx`
- `src/screens/pos/README.md`
- `src/screens/pos/index.tsx`
- `src/screens/pos/registers.tsx`
- `supabase/migrations/20261117220001_pos_register_session_foundation.sql`
- `tests/fixtures/pos/baseline.sql`
- `tests/integration/pos-register-sessions.sql`
- `docs/pos/batch-2-review.md` (this report)

## Safe Windows review

The cloud checkout is separate from `D:\MyApp\LinkBooks`. Protect local edits, fetch, and check out the review branch after it is published:

```powershell
cd D:\MyApp\LinkBooks
git status
if (git status --porcelain) { throw "Commit or stash changes first." }
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git switch --detach origin/feature/pos-register-sessions-20261117
if ($LASTEXITCODE -ne 0) { throw "Checkout failed." }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
npm.cmd run dev
```

Use the existing authorized development configuration and `http://localhost:8080/pos/registers`. No hosted migration is authorized by these review commands. The UI fails closed if its database upgrade is absent. `npm.cmd run test:pos:postgres` requires Docker and runs a disposable isolated database, not the configured hosted project.

## Manual staging checklist and remaining gates

- In a dedicated test company with the reviewed migration, create a register from an existing location/account; grant an active cashier location access and verify another location/company stays inaccessible.
- Open with physical float, retry the same request, count into the blank closing field, reject a variance, close matching cash, then retry close and verify locked history. Revoke location or count permission and repeat denied requests.
- Check exact USD/GBP/AUD/NZD/CAD/INR decimals; excessive precision and negative counts must fail.
- Review desktop/tablet/mobile, light/dark themes, keyboard searchable lookups, focus and screen-reader labels. Fixtures prove selected widths/flows, not full accessibility or real sessions.
- Do not collect customer payments through this module. Checkout, cash movements, adjustments, receipts/refunds, COGS, providers, offline/devices and restaurant workflows remain unimplemented.

Next release step: fix the GitHub account runner blocker, review release dependencies and complete approved full-schema/authenticated staging gates. Merge, live migration and deployment need separate explicit authorization. No such action was performed.
