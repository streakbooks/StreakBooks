# Module navigation redesign progress

**Batch 43 focus:** HR five-group IA + `ListWorkspace` `subnav` slot + Payroll `GroupedModuleSubnav`.

| Module | Screens (approx.) | Nav pattern | Status |
| --- | ---: | --- | --- |
| HR | 25 sections | GroupedModuleSubnav (5 groups) + ListWorkspace `subnav` | Redesigned Batch 43 |
| Payroll | 8 | GroupedModuleSubnav (4 groups) | Adopted Batch 43 |
| CRM | 20 | GroupedModuleSubnav | Adopted shared Batch 41 |
| Property Management | 23 | GroupedModuleSubnav | Adopted shared Batch 41 |
| Expenses | 16 | GroupedModuleSubnav + ListWorkspace `subnav` | Adopted shared Batch 41 |
| Sales / Purchases / Banking | 9–13 | ModuleSubnav (flat strip, denser) | Density Batch 41 |
| App Store | 16 | GroupedModuleSubnav | Redesigned Batch 41 |
| Developer | 14 | Compact wrap strip | Density Batch 41 — next candidate |
| Advisors | 12 | GroupedModuleSubnav | Redesigned Batch 41 |
| Advisors portal | — | Flat portal strip | Remaining |
| Accounting / Tax / Reports / Fixed assets / Contacts | route tabs | In-page `role="tab"` | Remaining audit |
| Dashboard, Files, Budgets, POS, Firm, Settings, AI, etc. | varies | Module-specific | Remaining |

## Completion snapshot (navigation chrome)

| Metric | Value |
| --- | ---: |
| Registered sidebar modules | 29 |
| Using GroupedModuleSubnav | 8 (HR, Payroll, CRM, PM, Expenses, App Store, Advisors + shared) |
| Remaining flat / tab / custom | ~21 |
| Estimated nav-pattern completion | ~28% of modules (chrome only; full DoD still 0) |

Routes, permissions, and stable section keys are unchanged unless a batch documents an intentional migration (Batch 43 added `workforce-insights` under Overview without removing existing keys).
