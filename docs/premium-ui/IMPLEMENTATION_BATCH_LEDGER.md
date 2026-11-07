# Implementation batch ledger

| Batch | Wave | Scope | Branch | PR/commit | Routes touched | Status |
| ----- | ---- | ----- | ------ | --------- | -------------- | ------ |
| 1–9 | 0–6 + §20 | Architecture through shared shells | — | PRs [#182](https://github.com/linkbusinessadvisory/LinkBooks/pull/182)–[#190](https://github.com/linkbusinessadvisory/LinkBooks/pull/190) | see prior ledger history | merged |
| 10 | 8 + §14 | Workspace landmarks, chrome unit tests, core DoD matrices | `feature/premium-ui-batch10-dod-hardening` | [PR #191](https://github.com/linkbusinessadvisory/LinkBooks/pull/191) → `f915a6a5` | shared workspaces + docs | merged |
| 11 | 8 + §12/14 | UI fixture List/RecordWorkspace, Playwright landmark tests, `check:workspace` | `feature/premium-ui-batch11-dod-evidence` | pending merge | e2e/ui + adoption script | ready |
| 12 | 8–9 | Authenticated browser DoD + staging | TBD | — | | planned |

Core finished-screen DoD remains **IN PROGRESS**. Chrome inheritance is enforced by `check:modules` + `check:workspace`.
