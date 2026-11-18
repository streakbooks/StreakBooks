# Premium UI/UX Gap Register

**Audited:** 2026-11-18 against `origin/main` `02397a65`  
**Method:** source inventory + contract checks + prior premium-ui evidence. Authenticated staging not executed.

Labels: `missing` | `partial` | `existing` | `blocked` | `drift`

| ID | Gap | Severity | Owner batch | Status |
| --- | --- | --- | --- | --- |
| G01 | No shared `TransactionWorkspace` | High | 25–26 | scaffold in 25; adoption 26 |
| G02 | No spreadsheet `EditableLineItemGrid` (keyboard/paste/sticky) | High | 25–36 | chrome 25; keyboard 27; resize/hide/5-rows Batch 36 |
| G03 | `SalesDocumentLines` card stack ≠ dense table UX | High | 26–36 | EditableLineItemGrid + keyboard/paste; Batch 36 columns/resize/5 rows |
| G04 | `PurchasesDocumentLines` lacks sticky header / keyboard / paste | High | 26–36 | sticky + keyboard/paste; Batch 36 vertical tax + Columns + resize |
| G05 | Missing shared `TotalsSummary` / `SplitButton` | Medium | 25–26 | scaffolded 25 |
| G06 | Density tokens absent; AppShell hardcoded widths | Medium | 25 | addressed 25 |
| G07 | Browsing manifest stale (21 vs 29 sidebar) | Medium | 30 | closed — synced to 29/156 |
| G08 | `check:browsing-coverage` not on main package.json | Medium | 30 | closed — npm script added |
| G09 | Inventory docs omit POS/CRM/PM/HR/Messages | Medium | 25 | refresh in 25 |
| G10 | Finished-screen DoD incomplete all modules | High | 26–29+ | open |
| G11 | Staging E2E / Section 18 | Blocker | 24 | blocked — no creds |
| G12 | Banking Receive/Spend Money premium workspace | High | 26–34 | TransactionWorkspace + TotalsSummary on money docs |
| G13 | Journals premium entry workspace | High | 27–34 | TransactionWorkspace + keyboard/paste on debit/credit |
| G14 | Cross-module visual inconsistency beyond chrome | High | 29–34 | light palette + soft tabs/subnav/cards; remaining module DoD open |
| G15 | Competitor screenshot usability not yet coded as LinkBooks contract | Medium | 25–36 | `TRANSACTION_WORKSPACE_UX.md` updated for spreadsheet contract |
| G16 | Dense bordered line cells / single default row / horizontal tax | High | 36 | closed on bills/invoices/quotes/credits/POs/journals/claims — quiet cells, 5 rows, wrap text, bottom TotalsSummary |

## Preserved / reuse (not gaps)

- AppShell, ModuleSubnav, PageHeader, List/RecordWorkspace, StatusBadge, FormSection, ConfirmDialog, Empty/Loading/Error
- 8 palettes + custom; semantic money/status tokens
- Accounting engine, RLS, period locks, posting services

## Originality

Usability references from supplied competitor collage only. No competitor assets, colours as brand, or distinctive trade dress. See COMPETITOR_GAP_AND_ORIGINALITY_MATRIX.md.
