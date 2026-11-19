# Finished-screen DoD — core modules (Batch 10)

Section 14 acceptance contract applied to high-traffic modules using **code and local-check evidence only**.  
Labels: `PASS` | `PARTIAL` | `N/A` | `NOT VERIFIED` | `BLOCKED`.

A screen is **not** DONE unless every applicable row is PASS or N/A with reason.

## Shared chrome (applies to all rows below)

| Gate | Status | Evidence |
| ---- | ------ | -------- |
| ListWorkspace / RecordWorkspace on authenticated surfaces | PASS | Batches #182–#190; `check:modules` PageHeader bypass |
| Themes / tokens inheritance | PASS | Shared `PageHeader` + `styles.css` tokens |
| Scaffold / future inheritance | PARTIAL | `scaffold:module` + `check:modules`; live screenshot of probe not retained |
| Authenticated staging QA | NOT VERIFIED | Authorized; `E2E_*` staging credentials not configured on workstation |
| Program / production authorization | PASS | Full authorization granted 2026-11-07 by product owner |
| Production go-live (Section 18) | BLOCKED | `npm run check:section18` reports open gates; staging/RBAC/manual a11y still evidence-open |

## Module matrices

### Banking (`/banking` and nested)

| # | Gate | Status | Notes |
| - | ---- | ------ | ----- |
| a | Route / inventory / registry | PASS | `MODULE_REGISTRY` + routes |
| b | Visual/UX shared chrome | PASS | ListWorkspace on accounts, txn, reconcile, transfers, docs; Banking insights rail (Batch 12) |
| c | Loading/empty/error | PARTIAL → enforcement PASS | Batch 16 `check:empty`; nested paths still spot-checked |
| d | Real actions / posting | PARTIAL | Existing confirmed-transfer/reconcile flows; no new posting this program |
| e | RBAC/RLS / cross-company | PARTIAL | Batches 20–21 unit deny-path (`assertCompany*`, demo reseed, globalSearch); live/staging two-tenant still NOT VERIFIED |
| f | Migrations | N/A | No schema from UI chrome |
| g | Honest empty/error copy | PARTIAL | Spot-checked feeds/CSV honesty preserved |
| h | Responsive / a11y | PARTIAL | Landmarks Batch 10; fixture axe on list/record Batch 19; manual SR/zoom NOT VERIFIED |
| i | Tests | PARTIAL | Domain tests exist; chrome unit tests added Batch 10 |
| j | Originality/license | PASS | No competitor assets |
| k | Docs | PASS | This matrix + ledger |
| l | Merge evidence | PASS | PRs #182–#190 |

**Module verdict:** `IN PROGRESS` — chrome PASS; finished-screen DoD not complete.

**Batch 11 source evidence:** `npm run check:workspace` requires Banking accounts/transactions/reconcile/transfers (and other high-traffic surfaces) compose `ListWorkspace`/`RecordWorkspace`.

### Sales (`/sales` + nested lists/details)

| # | Gate | Status |
| - | ---- | ------ |
| a | Route/registry | PASS |
| b | Shared chrome | PASS |
| c | State variants | PARTIAL |
| d | Real create/post/pay | PARTIAL (pre-existing engine) |
| e | RBAC/RLS | NOT VERIFIED this program |
| f | Migrations | N/A |
| g | Honest copy | PARTIAL |
| h | a11y/responsive | PARTIAL → fixture PASS for list/record landmarks + insight complementary |
| i | Tests | PARTIAL → `e2e/ui` workspace landmarks; invoice/contact insights wired in app |
| j | Originality | PASS |
| k | Docs | PASS |
| l | Merge evidence | PASS |

**Module verdict:** `IN PROGRESS`

**Batch 11 fixture evidence:** UI harness `/sales/invoices` uses `ListWorkspace` (`data-slot="list-workspace"`) with Sales subnav; bill fixture header uses `RecordWorkspace`; Playwright asserts labelled landmarks + h1.

**Batch 13:** Quote, credit note, and receipt details compose `WorkspaceInsights` (ledger/link facts).

### Purchases (`/purchases` + nested)

Same pattern as Sales — chrome **PASS**, full DoD **IN PROGRESS**. Batch 13–14 add Purchases overview, bill `RecordWorkspace`, and supplier credit/payment/order/expense insight rails.

### Contacts (`/contacts`)

Chrome **PASS** (directory + detail RecordWorkspace). Import/duplicates ListWorkspace. Full DoD **IN PROGRESS**.

### Expense Management / Payroll / Accounting / App Store / Advisors / Settings

Chrome largely **PASS** after Batches 5–9. Batch 15 adds factual insight rails on payslip, App Store detail, Accounting, Products & Services, and Dashboard. Per-screen action/permission/staging gates remain **NOT VERIFIED** / **PARTIAL**.

**Expense Management local evidence (Batches 65–67):** New claim create uses `TransactionWorkspace` + `EditableLineItemGrid` + `TotalsSummary` (parity with Banking Spend Money), plus spreadsheet Enter/Arrow keyboard and net/tax paste. `check:workspace` enforces claim create + spend/receive-money composition. Staging/RBAC/manual a11y still **NOT VERIFIED** — module remains **IN PROGRESS**, not COMPLETE.

**Conversion balances ELG (Batch 76):** `ConversionBalancesPanel` trial balance and opening AR/AP docs use shared `EditableLineItemGrid`; review strip uses `TotalsSummary`. Posting/validation unchanged. Staging/RBAC still **NOT VERIFIED**.

**Claim detail TotalsSummary (Batch 80):** Expense claim detail exposes `TotalsSummary` (line count + total) after the lines table. Staging/RBAC still **NOT VERIFIED**.

**Receipt/payment record totals (Batch 78):** Receipt and supplier payment records expose allocation `TotalsSummary` and fail closed with `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Create QueryErrorState (Batch 79):** Sales/PO orders, requisitions editor, and batch payment use `QueryErrorState` for options/load failures. Staging/RBAC still **NOT VERIFIED**.

**QueryErrorState sweep (Batches 88–99):** High-traffic and module-shell query load failures use shared `QueryErrorState` (optional description override for migration hints). Intentional deny-path `ErrorState` remains only where access succeeded but customization is disallowed (`StatementViews`). Staging/RBAC still **NOT VERIFIED** — modules remain **IN PROGRESS**, not COMPLETE.

**Production honesty Batch 101:** `PurchasesDocumentLines` ELG locked in `check:workspace`; Industry CoA panel, POS recent sales, and Action Center hard-fail inbox use `QueryErrorState`; sales order detail shows line table + `TotalsSummary`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 104:** Cash classification journal/document lookups, correction approval queue/events, workpaper reconciling items/history, AI workpaper evidence, journal exception history, reporting favourites + access dialog, and AI assistant status/history/accounts use `QueryErrorState` (mutation/validation alerts unchanged). Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 105:** Document email/OCR/recycle/review/preview extras, products price-list master data, sales document price-list lookups, contact follow-ups, and settings integration health / accounting preferences use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Bank coding + record totals (Batch 75):** `BankCodingPanel` uses shared `EditableLineItemGrid` + `TotalsSummary`. Bill and invoice read-only records use `TotalsSummary`. `MoneyDocumentPanel` fails closed with `QueryErrorState` when options queries fail. Staging/RBAC still **NOT VERIFIED**.

**Bills line grid ELG (Batch 74):** `PurchasesDocumentLines` composes shared `EditableLineItemGrid` (Sales parity). Drag reorder, tracking columns, tax modes, keyboard/paste, Add-lines Select, and TotalsSummary preserved. Staging/RBAC still **NOT VERIFIED**.

**Chrome honesty (Batch 73):** High-traffic creates expose StatusBadge meta (credit notes, claims, transfers, bills). SalesDocumentEditor and JournalPanels fail closed with ErrorState + retry when options queries fail. FormGrid/StatusBadge tokens locked in `check:workspace`. Modules remain **IN PROGRESS** — staging/RBAC still **NOT VERIFIED**.

**Order entry spreadsheet (Batch 72):** Shared `OrderEntryLines` uses EditableLineItemGrid with journal-parity keyboard/paste for sales orders and requisitions; new docs start with two empty rows. SalesDocumentLines + PurchasesDocumentLines TotalsSummary/keyboard helpers locked in `check:workspace`. PurchasesDocumentLines ELG composition is locked (Batch 74 + Batch 101).

**Purchases requisitions + claims FormGrid (Batch 71):** Requisition create/edit exposes FormGrid + TotalsSummary with sticky save; claim create header uses FormGrid; journal and sales document editors locked in `check:workspace`.

**Sales / Purchases create chrome (Batch 70):** Recurring invoices and sales orders expose TotalsSummary; batch payment uses TransactionWorkspace with allocation totals. `check:workspace` enforces those surfaces.

**Sales / Purchases / Banking allocate evidence (Batch 69):** Receipt and payment creates expose TotalsSummary allocation strips; payments use a dense allocate table; transfers show Amount/Received totals. `check:workspace` enforces those surfaces.

**Purchases / Banking local evidence (Batch 68):** Spend Money, purchase orders, and purchase credit notes wire `interpretLineGridKey` + paste; CN TotalsSummary shows net/tax/total. `check:workspace` enforces those create surfaces.

**Banking local evidence (Batch 67):** `check:workspace` requires Receive Money (`MoneyDocumentPanel`) and Spend Money (`NewExpense`) compose TransactionWorkspace / TotalsSummary. Staging still **NOT VERIFIED**.

## How to promote a module to DONE

1. Fill Section 14 checklist with browser evidence (desktop/mobile, keyboard, light/dark).
2. Run relevant Playwright suite for that module.
3. Confirm deny-path RBAC on at least one mutation.
4. Update this file row-by-row; never mark DONE from chrome adoption alone.
