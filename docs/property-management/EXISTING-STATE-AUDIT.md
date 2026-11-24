# Phase 0 — Existing-state audit

**Audited:** 2026-11-18  
**Baseline commit:** [`0ca84bef58d9783dd993c21eb72e145d979d1ab7`](https://github.com/streakbooks/StreakBooks/commit/0ca84bef58d9783dd993c21eb72e145d979d1ab7)  
**Local HEAD:** matched `origin/main` at audit time  
**Open PRs on authoritative repo:** none listed via `gh pr list` at audit time  
**Local dirty tree at start:** `src/routeTree.gen.ts` line-ending noise only (restored before branch)

## Verdict

No dedicated Property Management product module exists on `main`. Only:

- App Store category `property_management` (catalogue taxonomy)
- Industry COA packs: `residential_rental`, `short_term_rental`, `property_management`

## Capability classification

| Capability | Status | Notes |
| --- | --- | --- |
| Properties / buildings | **Missing** | No tables, routes, screens, permissions |
| Units | **Missing** | — |
| Owners / ownership shares | **Missing** (contacts **Partial**) | `contacts` reusable; no ownership link |
| Management agreements | **Missing** | — |
| Tenants / leases / rent schedules | **Missing** | Demo “office lease” text only |
| STR reservations / folios | **Missing** | COA copy mentions Airbnb/VRBO |
| Owner statements | **Missing** (statement chrome **Partial**) | Sales/purchases/portal statements ≠ owner settlement |
| Commissions / fee engine | **Missing** | — |
| Owner payouts / reserves | **Missing** | — |
| Trust accounting | **Missing** | Deposit liability templates in COA only |
| Owner / tenant portals | **Missing** (generic portals **Partial**) | Customer/supplier + advisors portals exist |
| PM reports | **Missing** (Reports Centre **Existing**) | Framework reusable |
| PMS integrations | **Missing** (App Store engine **Partial**) | Shopify/Amazon/Stripe adapters only |
| Chart of accounts / journals | **Existing and Verified** | `post_journal`, `reverse_journal`, period locks |
| Banking reconciliation | **Existing and Verified** | Match / session RPCs |
| Sales invoices / purchases bills | **Existing and Verified** | Rent/expense posting targets |
| Tracking dimensions | **Existing and Verified** | Class/location/project options |
| Module scaffold / premium UI | **Existing and Verified** | `ListWorkspace`, `RecordWorkspace`, DoD gates |

Nothing classified **Defective** or **Blocked** — absence, not broken PM code.

## Platform plug-in points

| Concern | Location |
| --- | --- |
| Module registry | `src/lib/modules/registry.ts` |
| Sidebar nav | `src/lib/nav.ts` |
| Permissions catalogue | `src/lib/permissions.ts` |
| Access UI | `src/lib/access-catalogue.ts` |
| Permission seed | `public.role_permissions` migrations |
| Routes | `src/routes/_authenticated/` + screens in `src/screens/` |
| Scaffold | `npm run scaffold:module` |
| DoD | `docs/engineering/NEW-MODULE-DEFINITION-OF-DONE.md` |
| Design system | `docs/premium-ui/STREAKBOOKS_DESIGN_SYSTEM.md` |

## Concurrent development notes

- Active local branches observed: `feature/advisors-ad-02-plans-admin-controls`, `feature/premium-ui-master-wave0-1` (worktree, behind main)
- Recent migrations (POS, messaging, purchases, coding memory) — PM migrations must use a later timestamp and remain additive
- No open property-management PRs detected at audit time
