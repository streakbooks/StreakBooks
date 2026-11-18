# Implementation batch ledger

| Batch | Wave | Scope | Branch | PR/commit | Routes touched | Status |
| ----- | ---- | ----- | ------ | --------- | -------------- | ------ |
| 1–9 | 0–6 + §20 | Architecture through shared shells | — | PRs [#182](https://github.com/linkbusinessadvisory/LinkBooks/pull/182)–[#190](https://github.com/linkbusinessadvisory/LinkBooks/pull/190) | see prior ledger history | merged |
| 10 | 8 + §14 | Workspace landmarks, chrome unit tests, core DoD matrices | `feature/premium-ui-batch10-dod-hardening` | [PR #191](https://github.com/linkbusinessadvisory/LinkBooks/pull/191) → `f915a6a5` | shared workspaces + docs | merged |
| 11 | 8 + §12/14 | UI fixture List/RecordWorkspace, Playwright landmark tests, `check:workspace` | `feature/premium-ui-batch11-dod-evidence` | [PR #192](https://github.com/linkbusinessadvisory/LinkBooks/pull/192) → `b80caff9` | e2e/ui + adoption script | merged |
| 12 | 8 | Factual WorkspaceInsights rail on Banking/Sales/Contacts | `feature/premium-ui-batch12-insight-rail` | [PR #193](https://github.com/linkbusinessadvisory/LinkBooks/pull/193) → `ed017a38` | banking + invoice + contact | merged |
| 13 | 8 | Expand WorkspaceInsights across Sales/Purchases/Banking records | `feature/premium-ui-batch13-insight-expansion` | [PR #194](https://github.com/linkbusinessadvisory/LinkBooks/pull/194) → `3fe577be` | quotes/credits/receipts/payments/journal + overviews | merged |
| 14 | 8 | Bill RecordWorkspace + insights on orders/expenses/claims/payroll/budgets | `feature/premium-ui-batch14-bill-workspace-insights` | [PR #195](https://github.com/linkbusinessadvisory/LinkBooks/pull/195) → `3bf24f31` | bill detail + remaining records | merged |
| 15 | 8 | Payslip/App Store/Accounting/Products/Dashboard rails + doc sync | `feature/premium-ui-batch15-remaining-rails-docs` | [PR #196](https://github.com/linkbusinessadvisory/LinkBooks/pull/196) → `0e98a58a` | payslip, app-store, accounting, products, dashboard | merged |
| 16 | 8–9 | Empty/error honesty gate + production auth recorded | `feature/premium-ui-batch16-empty-error-honesty` | [PR #197](https://github.com/linkbusinessadvisory/LinkBooks/pull/197) → `d56eff77` | check:empty + bills empty CTA + readiness | merged |
| 17 | 8–9 | Fix misplaced ListWorkspace/fragment closes blocking prod build | `feature/premium-ui-batch17-prod-build-fix` | [PR #198](https://github.com/linkbusinessadvisory/LinkBooks/pull/198) → `a566ba94` | advisors, app-store, developer, EM, branding | merged |
| 18 | 8–9 | Fix `escapeLikeLiteral` MISSING_EXPORT blocking Vercel prod SSR | `feature/premium-ui-batch18-escape-like-export` | [PR #199](https://github.com/linkbusinessadvisory/LinkBooks/pull/199) → `0c37373a` | customer-price-list.functions | merged |
| 19 | 8–9 | Full-auth record + workspace axe fixtures + rollback plan + local gate evidence | `feature/premium-ui-batch19-a11y-auth-evidence` | [PR #201](https://github.com/linkbusinessadvisory/LinkBooks/pull/201) → `3db2a508` | e2e/ui a11y + readiness docs | merged |
| 20 | 8–9 | Deny-path RBAC unit evidence + label-in-name honesty on shared controls | `feature/premium-ui-batch20-rbac-a11y-honesty` | [PR #202](https://github.com/linkbusinessadvisory/LinkBooks/pull/202) → `fc385286` | assert-company-access + Columns/Clear a11y | merged |
| 21 | 8–9 | Error-retry gate + Bills ListWorkspace + demo/search isolation + Lookup clear a11y | `feature/premium-ui-batch21-error-retry-bills-isolation` | [PR #203](https://github.com/linkbusinessadvisory/LinkBooks/pull/203) → `e31e4f7f` | bills.index + check:error-retry + demo/search tests | merged |
| 22 | 8–9 | Section 18 gate reporter + firm filter label association + accounting invariant npm script | `feature/premium-ui-batch22-section18-gate-firm-a11y-invariants` | [PR #204](https://github.com/linkbusinessadvisory/LinkBooks/pull/204) → `64f6fe82` | check:section18 + firm portfolio + test:accounting-invariants | merged |
| 23 | 8–9 | Apply pending Nov budget/tax/recon SQL to linked prod + evidence docs | `feature/premium-ui-batch23-supabase-migration-apply` | pending merge | 11 migrations via db query + repair | ready |
| 24 | 8–9 | Staging smoke (when E2E creds), live RBAC, manual a11y, release close-out | TBD | — | | planned |
| 25 | Phase 1 | Density tokens, AppShell wiring, TransactionWorkspace/TotalsSummary/SplitButton/EditableLineItemGrid/FormGrid scaffolds, central tracker | `feature/premium-ui-batch25-phase1-foundation` | open | shared chrome + docs | in progress |
| 26 | Phase 3 | Adopt TransactionWorkspace on Sales + Purchases (+ journals entry where safe) | TBD | — | sales/purchases editors | planned |
| 27 | Phase 3 | Spreadsheet keyboard/paste/sticky behaviours on line grids | TBD | — | line editors | planned |
| 28 | Phase 3–4 | Banking money docs + journals workspace adoption | TBD | — | banking/accounting | planned |
| 29+ | Phase 4–10 | Remaining modules DoD + browsing manifest refresh | TBD | — | all modules | planned |

Core finished-screen DoD remains **IN PROGRESS**. Chrome inheritance is enforced by `check:modules` + `check:workspace`. Central progress: [TRANSFORMATION_TRACKER.md](./TRANSFORMATION_TRACKER.md).
