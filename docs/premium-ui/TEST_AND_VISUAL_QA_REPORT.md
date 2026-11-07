# Test and visual QA report

## Batches 1–9 — cumulative local evidence (2026-11-07)

| Check | Result | Evidence |
| ----- | ------ | -------- |
| `npm run check:modules` | **Passed** (incl. PageHeader bypass scan from Batch 9) | 28 modules, 24 sidebar, docs + no direct PageHeader in screens/routes |
| `vitest` modules + workspace + responsive contracts | **Passed** (Batch 10) | 17 tests incl. List/Record landmarks; vitest now includes `*.test.tsx` |
| Core finished-screen DoD matrices | **Documented IN PROGRESS** | `FINISHED-SCREEN-DOD-CORE.md` — chrome PASS, staging/RBAC NOT VERIFIED |
| `check:workspace` high-traffic adoption | **Passed** (Batch 11) | Banking/Sales/Purchases/Contacts/Dashboard/Accounting/Action Center + e2e fixture |
| Playwright UI workspace landmarks | **Passed** (Batch 11–12) | list + record chrome (+ insight complementary) in `e2e/ui/ui.spec.ts` |
| WorkspaceInsights adoption | **Expanded** (Batch 13–15) | + payslip, App Store, Accounting, Products & Services, Dashboard; factual links/balances only |
| Empty-state honesty gate | **Passed** (Batch 16) | `npm run check:empty`; bills empty CTA fixed to real Link |
| `npm run check:ui` | **Passed** | 0 violations across batches |
| `npm run check:navigation` | **Passed** (Batch 1 baseline) | 24 modules native-nav audit |
| Route/screen List/RecordWorkspace adoption | **In progress → largely complete** | PRs #182–#189 + Batch 9 shared shells |
| `npm run typecheck` | **Not clean repo-wide** | Pre-existing unrelated errors remain |
| Playwright UI + workspace axe (Batch 19) | **Passed** 74/74 | list/record axe; density label-in-name; Clear name; subnav native-link assertion |
| Deny-path RBAC unit helpers (Batch 20) | **Passed** (assert-company-access) | Permission/member false + RPC error paths |
| Label-in-name shared controls (Batch 20) | **Fixed** | Columns/Clear accessible names match visible text |
| Error-retry gate + Bills ListWorkspace (Batch 21) | **Passed** | `check:error-retry`; bills.index ListWorkspace + factual insights |
| Demo + globalSearch isolation units (Batch 21) | **Passed** | Non-demo reseed deny; search membership + company_id scope |
| Section 18 gate reporter (Batch 22) | **Reporting** | `npm run check:section18`; go-live still FORBIDDEN |
| Firm filter label association (Batch 22) | **Fixed** | Practice status / review / sort use Label htmlFor + trigger id |
| Accounting invariant local suite (Batch 22) | **Passed** 54/54 | `npm run test:accounting-invariants` |
| Authenticated staging smoke | **Not run** | Authorized; `E2E_*` credentials unset on workstation |
| GitHub CI | Not dispatched by instruction | Push may auto-trigger; full auth allows observation |

## Future-module inheritance proof (§20)

1. Scaffold CLI generates `ListWorkspace`/`RecordWorkspace` + fail-closed disabled buttons.
2. `check:modules` requires registry ↔ nav ↔ docs ↔ architecture files **and** forbids direct `PageHeader` imports in `src/screens` / `src/routes`.
3. Unknown domain statuses resolve neutral/`unmapped` (unit tested).
4. Temporary probe created, tested, removed — not left on `main`.

Classify overall future-module auto-inheritance: **PARTIAL / architecture verified**. Finished-screen DoD across all workflows remains open.
