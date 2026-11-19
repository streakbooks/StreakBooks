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

**Production honesty Batch 106:** AI journal evidence/review queue/financial insights/explanation, budget dimensions/variance/forecast/governance, and platform health/overview/resource/approvals/support use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 107:** CRM opportunity/activity create lookups, contact timeline assignees, contact settings groups/tags, period-close checks/year-end preview, and contacts cloud preferences use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 108:** Document record/version/classification/inbox settings, bank coding suggestions/options + import duplicates + rule suggestions, payroll payment settlement lookups + employee recent payslips, platform MRR reconciliation/cohorts, journal line detail, firm onboarding assignees, settings workflow defaults + extended org settings use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 109:** Firm onboarding dashboard/workload/escalations/service catalog/client profiles/custom templates/bulk audit, bank match candidates, public pricing plans, and platform payment/legal/partner billing admins use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 110:** Platform coupons/finance/billing analytics, settings category config, firm invite preview, supplier intelligence, platform record/search, global search, attachments list, chart account merge preview, and correction history use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 111:** Platform API keys/billing shell/country pricing, org subscription/invoices, settings overview/features/comms, firm partner portal, report activity/saved views, document posting journals, contacts groups/tags, and imports budgets/assets readiness use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 112:** Bank integrity banner, digest/notification preferences, subscription lifecycle, message receipts, project tags, standard statement filter options, company invite, platform access gate, and shared invoice use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 113:** Report route accounting-basis load uses `QueryErrorState`; platform support/approvals/bulk/ops mutation errors use `friendlyAuthError`; expanded CompanySwitcher organisation load uses `QueryErrorState` (collapsed keeps compact Retry). Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 114:** Document send/share, settings dimensions, firm onboarding reports, security MFA/identities, bill payment accounts, referral status, billing access banner, GL account filters, project create customers, and advisors service catalogue no longer fail silently — they use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 115:** Chart/tax options on account form, App Launcher catalogue, platform announcements, advanced account transactions / analysis / planning report account filters, and budget list load use `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 116:** Org/platform billing and fixed-asset mutation toasts route through `friendlyAuthError`; Banking Transactions badge omits count when workspace counts fail (never implies zero). Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 117:** Advisor chat, checkout validation, document email failure copy, platform editor/automation, standard report controls, AI journal evidence queue, and portal MFA setup messages use `friendlyAuthError` (including unsafe `e.message` on platform editor). Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 118:** Create-new panel load, Action Center bulk/refresh, reporting model open, platform diagnostics/export, public plan-builder quote errors, fixed-asset review/preview surfaces, and recurring Run-due partial failure toasts use `friendlyAuthError`. CSV/statement parse messages remain domain copy. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 119:** Document OCR failure toasts, fixed-asset depreciation stop alerts/toasts, and platform ops local-datetime parse errors use `friendlyAuthError`; calculator evaluate catch no longer assumes `Error`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 120:** Shared lookup fetch errors, expense batch-reimburse partial failures, cash-coding bulk/all-matching failures, and bank transfer statement-match errors use `friendlyAuthError`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 121:** Expense reimbursements/advances/petty-cash/exit-settlement bank (and member) lookups fail closed with `QueryErrorState` instead of empty pickers; bank rules coding options and banking hub GL/details likewise; banking bulk code, recurring journal run, sales/purchases authorise, credit allocation, and product price audit partial failures use `friendlyAuthError`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 122:** Expense claim create options, mileage/travel admin accounts, corporate-card liability/claims match lookups, expense settings chart accounts, approval delegate members, and bank-import account picker fail closed with `QueryErrorState`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 123:** Property Management settings/units/leases/portals/statements/ownership/rent create pickers, HR employee-detail org structure and leave/shift employee pickers, and CRM lead/campaign source pickers fail closed with `QueryErrorState`; imports and customer price-list audit failures use `friendlyAuthError`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 124:** Remaining HR dialog employee pickers (attendance, assets, documents, onboarding, offboarding, training, compensation, performance, transfers, relations) fail closed with `QueryErrorState` instead of empty selects. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 125:** Payroll run adjust/settings, payments payslip allocation, HR payroll handoff components, bill/sales document option queries (incl. products and credit-note invoices), advisor reschedule slots, conversion setup/contacts, cash opening tax codes, and customer price-list defaults fail closed with `QueryErrorState` (or omit child UI until lists succeed). Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 126:** Salary-structure component catalogue and firm client-request team assignee fail closed with `QueryErrorState` (empty pickers no longer implied on load failure). Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 127:** Dual-path EmptyState fixed for HR leave/performance/assets/shifts/manager/self-service/attendance corrections, EM mileage/travel/cards/petty-cash/advances lists, and correction approval queue; document email `recordWarning` and firm bulk service suggestions use fail-closed honesty. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 128:** Supplier/customer/staff portal dual-path empty honesty; billing invoices empty gated on `!isError`; TaxIdForm fail-closed on billing account load; document/settings delivery history via `friendlyAuthError`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 129:** Property Management settings dual-path no longer reports Module disabled on load failure; agreements/reservations/owner-payouts create pickers, EM unmatched card txs and receipt claim match, and tax-rate dialog fail closed; recurring/FX/automation/report-pack `last_error`, statement/OCR delivery copy use `friendlyAuthError`. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 130:** CRM screens fail-closed on settings load (`QueryErrorState`); HR holidays/automations and EM mileage/travel/cards/approvals dual-path EmptyState honesty; Action Center document-request file picker QES. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 131:** Property Management settings show LoadingState before Module disabled; MessagesBell no longer treats in-flight settings as disabled; customer price defaults and correction history empty copy gated on `!isError`; corporate-card liability/claim pickers omit empty selects on load failure. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 132:** Firm Activity clients load no longer looks empty while pending/failed; CRM screens and HR overview show LoadingState while settings load; portal statement empty period copy; disputed corporate-card section shares QueryErrorState; practice assignee picker shows loading/refresh guidance. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 133:** Exit settlement distinguishes missing members.view vs load failure vs empty roster; HR/PM Save mappings fail-closed until settings/accounts succeed; EM mileage/travel/petty-cash/cash-advances omit empty bank/account pickers on failure; CRM public-forms policy QES; portal MFA Confirm requires a 6-digit code. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 134:** CRM activity/opportunity/team and products price-list pickers omit empty Selects beside QueryErrorState; contacts group/tag filters and HR organisation parent pickers fail-closed; ContactTimeline keeps self-assign when team load fails. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 135:** Bill payment, banking add-account, chart AccountForm and cash-classification journal pickers omit empty lookups beside QueryErrorState; AccountForm and expense settings Save fail-closed until options load; disputed cards, bank suggestions and delegations show LoadingState before empty copy. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 136:** Imports budget select, AI journal reviewer assign, PM owner/tenant contacts, tax GL mappings and payroll clearing omit empty pickers beside QueryErrorState; report account multi-selects omit on accounts error; dimensions Add fail-closed until kinds load; tax codes/returns respect accountsLoadFailed. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 137:** Accountant tax-adjustment omit AccountLookups + Post fail-closed; sales draft price-list omit beside QES; CRM opportunity stage omit on pipeline error; lead conversion matches empty only on success; POS and PM list EmptyStates gated `!isError`; Trial Balance account multi-select omitted on report error. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 138:** Products tier/discount/override Saves fail-closed; dual-path empty copy gated; supplier portal omits PO picker + disables Submit on workspace error; remittances show LoadingState; conversion trial-balance grid omitted beside setup QES; messages search empty only on success. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 139:** Billing API keys/coupons omit LookupSelects beside QES; cash classification omits tax code picker + fail-closes Approve when tax lines need codes; firm onboarding assignee/filters omit on load failure; HR leave/shifts/assets/performance secondary selects + Saves fail-closed; staff bank Verify list exclusive with QES; platform approvals empty gated on success. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 140:** HR holidays/training/recruitment/onboarding/transfers/self-service secondary pickers omit or QES on option-query failure; header actions and Saves fail-closed; notifications document-request empty copy gated on success. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 141:** Cash Summary, Bank Recon Summary, Tax Summary and Budget vs Actual omit account/budget toolbar pickers when the report (or budgets) query errors; HR attendance/documents/compensation/offboarding/relations/employee-detail Saves fail-closed on employee/org success; advisors booking Confirm requires a slot and omits slot buttons beside QES. Staging/RBAC still **NOT VERIFIED**.

**Production honesty Batch 142:** Advisors manage-appointment slot buttons exclusive with QES and Confirm fail-closed; messages mention/add-member/new-conversation peer lists show loading/error before empty; budget dimension View select omitted on actuals error; advisors landing services grid exclusive with catalogue QES. Staging/RBAC still **NOT VERIFIED**.

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
