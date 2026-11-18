# Authoritative POS implementation tracker

Overall production-verified acceptance: `[....................] 0%` — 0 of 525 enumerated requirements verified in production. Local implementation and fixture tests are tracked separately. The register enumerates directive sections 4–15; narrative/execution obligations also apply.

| Measure                         | Actual status                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Total requirements              | 525                                                                                                                                           |
| Completed / production-verified | 0                                                                                                                                             |
| IN PROGRESS                     | 12 requirements partially implemented                                                                                                         |
| NOT STARTED                     | 513                                                                                                                                           |
| Blocked requirements            | No whole row reclassified yet; release blockers listed below                                                                                  |
| Deferred scope                  | Providers, offline/hardware, stock/COGS and advanced retail/restaurant phases remain unimplemented                                            |
| Code                            | IMPLEMENTED: catalogue preview, cash checkout UI/server fns, recent-sale full refund UI, cash in/out, dedicated permissions, register creation, location grants, idempotent session commands |
| Database / migration            | `20261117220001` + `20261118140000` applied to linked Supabase `ipxflpzfcqwtenodbxwc` on 2026-11-18 via `db query` + `migration repair` (see `docs/pos/SUPABASE-CI-AND-MIGRATION.md`) |
| Unit / mocked integration       | POS lib: 84 passed locally after cash-sale + refund UI hardening                                                                              |
| Database security/concurrency   | Foundation suite retained; cash-sale SQL adds cashier refund permissions, conflicting replay rejection, and refund/close assertions in `tests/integration/pos-cash-sale.sql` — Docker unavailable on this workstation |
| Browser                         | POS e2e fixtures add refund RPC stub; `cart.spec.ts` covers refund happy path locally — suite not re-executed this session; no authenticated staging browser flow |
| TypeScript / build              | `tsc --noEmit` passed after journal-display POS labels; production build not re-run this session                                              |
| PR                              | Draft #238 — cash-sale continuation pushed for review                                                                                         |
| GitHub CI                       | Previously blocked by account billing/spending limit; re-check on new head                                                                    |
| Merge / staging / production    | Migrations applied to linked production Supabase; app PR #238 not merged; authenticated UI refresh still required for verification            |

Release blockers: approved full-schema migration rehearsal and authenticated staging validation; live application of `20261118140000_pos_cash_sale_expected_cash.sql`; variance adjustment posting UI, partial returns and supervisor approvals, inventory valuation, provider/device credentials, country fiscal scenarios, offline access and advanced workflows remain open. Local cash sale and full-refund UI wiring does not prove production posting. No production readiness claim.

Next executable batch after migration authorization: authenticated staging checkout/refund rehearsal, variance adjustment posting, then inventory/provider phases.

Concurrency: main advanced during work; #237 CI restoration, #241 audit repair and #246 focused regression repairs were merged externally. The integrated review includes main through `98d93735`. Preserve #227's broad cleanup and #225 financial-intelligence work. Focused fixes and formatting/lookup release repairs remain separate commits for review, with overlaps documented. No shared history is rewritten.
