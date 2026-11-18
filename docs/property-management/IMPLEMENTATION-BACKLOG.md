# Implementation backlog (PR batches)

| Batch | Scope | Depends on | Status |
| --- | --- | --- | --- |
| PM-00 | Audit, PRD, architecture, gap register, tracker | — | Done (PR #267) |
| PM-01 | Module nav, permissions, settings, master-data foundations | PM-00 | Done (PR #267) |
| PM-02 | Properties, units, owners, agreements (full CRUD + validation) | PM-01 | Done (PR #268+) |
| PM-03 | Tenants, leases, rent, deposits | PM-02 | In progress (tables/UI; deposit UI thin) |
| PM-04 | STR reservations + financial normalization | PM-02 | In progress (register + statement inputs) |
| PM-05 | Property ledger allocations + accounting integrity | PM-03, PM-04 | Pending (`post_journal` not wired) |
| PM-06 | Commission / revenue-share engine | PM-05 | Partial (SQL `calculate_pm_commission` + pure TS tests) |
| PM-07 | Owner statement calculation engine | PM-06 | In progress (generate/approve/publish + snapshot) |
| PM-08 | Templates, lifecycle, bulk generation | PM-07 | Partial (lifecycle states; no bulk/templates yet) |
| PM-09 | Payouts, reserves, trust reconciliation | PM-07 | Pending |
| PM-10 | Owner and tenant portals | PM-08, PM-09 | Pending |
| PM-11 | Property reports and analytics | PM-05+ | Pending |
| PM-12 | PMS import adapters + automation | PM-04 | Pending |
| PM-13 | Premium UX + E2E journeys | PM-10+ | Pending |
| PM-14 | Security hardening, performance, release readiness | All | Pending |

## Prioritization note

Accounting foundation → commissions → owner statements → approval → payouts → reconciliation are the critical path. Portals and PMS sync must not block statement engine design.
