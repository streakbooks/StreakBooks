# Implementation batch ledger

| Batch | Wave | Scope | Branch | PR/commit | Routes touched | Status |
| ----- | ---- | ----- | ------ | --------- | -------------- | ------ |
| 1 | 0–1 + §20 | ModuleDefinition, workspaces, scaffold, checks, docs | `feature/premium-ui-master-wave0-1-inplace` | [PR #182](https://github.com/linkbusinessadvisory/LinkBooks/pull/182) → `511a3713` | architecture (all inherit) | merged |
| 2 | 2 | Adopt ListWorkspace on Banking + Contacts | `feature/premium-ui-batch2-workspaces` | [PR #183](https://github.com/linkbusinessadvisory/LinkBooks/pull/183) → `7b323413` | `/banking`, transfers, money-documents, `/contacts` | merged |
| 3 | 3 | ListWorkspace on Sales + Purchases overviews | `feature/premium-ui-batch3-sales-purchases` | [PR #184](https://github.com/linkbusinessadvisory/LinkBooks/pull/184) → `2218927d` | `/sales`, `/purchases` | merged |
| 4 | 2–4 | Fix workspace exactOptional props + ListWorkspace on Products, Files, EM, Budgets | `feature/premium-ui-batch4-fix-and-more` | [PR #185](https://github.com/linkbusinessadvisory/LinkBooks/pull/185) → `45745e39` | products, files, EM overview, budgets | merged |
| 5 | 4–6 | ListWorkspace on Help, Tax, Fixed assets, Reports, Payroll overview, App Store | `feature/premium-ui-batch5-more-modules` | [PR #186](https://github.com/linkbusinessadvisory/LinkBooks/pull/186) → `c7729c2e` | help, tax, fixed-assets, reports, payroll, app-store | merged |
| 6 | 3–4 | Nested Sales/Purchases/EM/Payroll lists + Accounting shell | `feature/premium-ui-batch6-nested-lists` | [PR #187](https://github.com/linkbusinessadvisory/LinkBooks/pull/187) → `52653bd8` | 28 list/index screens | merged |
| 7 | 3–6 | RecordWorkspace details + Advisors/Firm/Settings/Developer/AI | `feature/premium-ui-batch7-records-practice` | pending | detail + practice/platform | in progress |
| 8 | 7–8 | Smart views where applicable + hardening | TBD | — | | planned |
| 9 | 9 | Staging readiness | TBD | — | | planned |

Concurrent WIP preserved separately (app-store connection lifecycle) — not part of Batch 1–6.
