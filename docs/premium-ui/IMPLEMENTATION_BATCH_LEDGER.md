# Implementation batch ledger

| Batch | Wave | Scope | Branch | PR/commit | Routes touched | Status |
| ----- | ---- | ----- | ------ | --------- | -------------- | ------ |
| 1–9 | 0–6 + §20 | Architecture through shared shells | — | PRs [#182](https://github.com/linkbusinessadvisory/LinkBooks/pull/182)–[#190](https://github.com/linkbusinessadvisory/LinkBooks/pull/190) | see prior ledger history | merged |
| 10 | 8 + §14 | Workspace landmarks, chrome unit tests, core DoD matrices | `feature/premium-ui-batch10-dod-hardening` | [PR #191](https://github.com/linkbusinessadvisory/LinkBooks/pull/191) → `f915a6a5` | shared workspaces + docs | merged |
| 11 | 8 + §12/14 | UI fixture List/RecordWorkspace, Playwright landmark tests, `check:workspace` | `feature/premium-ui-batch11-dod-evidence` | [PR #192](https://github.com/linkbusinessadvisory/LinkBooks/pull/192) → `b80caff9` | e2e/ui + adoption script | merged |
| 12 | 8 | Factual WorkspaceInsights rail on Banking/Sales/Contacts | `feature/premium-ui-batch12-insight-rail` | [PR #193](https://github.com/linkbusinessadvisory/LinkBooks/pull/193) → `ed017a38` | banking + invoice + contact | merged |
| 13 | 8 | Expand WorkspaceInsights across Sales/Purchases/Banking records | `feature/premium-ui-batch13-insight-expansion` | [PR #194](https://github.com/linkbusinessadvisory/LinkBooks/pull/194) → `3fe577be` | quotes/credits/receipts/payments/journal + overviews | merged |
| 14 | 8 | Bill RecordWorkspace + insights on orders/expenses/claims/payroll/budgets | `feature/premium-ui-batch14-bill-workspace-insights` | pending merge | bill detail + remaining records | ready |

Core finished-screen DoD remains **IN PROGRESS**. Chrome inheritance is enforced by `check:modules` + `check:workspace`.
