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
| Authenticated staging QA | NOT VERIFIED | Not executed |
| Production | BLOCKED | No authorization |

## Module matrices

### Banking (`/banking` and nested)

| # | Gate | Status | Notes |
| - | ---- | ------ | ----- |
| a | Route / inventory / registry | PASS | `MODULE_REGISTRY` + routes |
| b | Visual/UX shared chrome | PASS | ListWorkspace on accounts, txn, reconcile, transfers, docs; Banking insights rail (Batch 12) |
| c | Loading/empty/error | PARTIAL | Present on major screens; not every nested state audited |
| d | Real actions / posting | PARTIAL | Existing confirmed-transfer/reconcile flows; no new posting this program |
| e | RBAC/RLS / cross-company | NOT VERIFIED | Relies on pre-existing server auth; not re-proved here |
| f | Migrations | N/A | No schema from UI chrome |
| g | Honest empty/error copy | PARTIAL | Spot-checked feeds/CSV honesty preserved |
| h | Responsive / a11y | PARTIAL | Landmarks added Batch 10; manual SR/zoom NOT VERIFIED |
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

Chrome largely **PASS** after Batches 5–9. Per-screen action/permission/staging gates remain **NOT VERIFIED** / **PARTIAL**.

## How to promote a module to DONE

1. Fill Section 14 checklist with browser evidence (desktop/mobile, keyboard, light/dark).
2. Run relevant Playwright suite for that module.
3. Confirm deny-path RBAC on at least one mutation.
4. Update this file row-by-row; never mark DONE from chrome adoption alone.
