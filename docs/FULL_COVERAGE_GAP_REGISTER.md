# LinkBooks — Full-coverage gap register

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline** | GitHub `main` @ `c24ac11a` |
| **IP policy** | Originality-first — see [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md) |
| **Classification** | Complete and Verified / Partial / UI Only / Backend Only / Missing / Blocked / Intentionally Deferred |

**Rule:** Presence of a UI element or a green build does **not** make a feature Complete and Verified. Staging/production verification and acceptance questions in the master directive must remain open until evidenced.

Competitor columns cite **public product capabilities** only. No competitor source or UI was inspected for implementation cloning.

## Module roll-up (minimum coverage list)

| Gap ID | Module | Status | Priority | Summary | Competitor concept refs | Next action |
|--------|--------|--------|----------|---------|-------------------------|-------------|
| M-01 | Dashboard | Partial | P1 | Ledger-backed KPIs exist; multi-currency/permission tie-out not certified | Xero/QBO dashboard overview | Fixture golden vs reports |
| M-02 | Banking & reconciliation | Partial | P0 | CSV/QIF/rules/match/unmatch/recon; first-session opening #248; ledger-only truncate #249; transfer auto-match #250; live bank feeds blocked | Xero bank feed (paid), Odoo sync (Enterprise) | Provider selection; E2E recon proof |
| M-03 | Sales & receivables | Partial | P0 | Invoice/quote/credit/receipt/statement/as-at AR; credit-limit #242; copy credit/quote; authorise totals + save-authorise honesty #257/#258 | Xero/QBO AR | Gateway + authenticated lifecycle matrix |
| M-04 | Purchases & payables | Partial | P0 | Bills/PO/payments/credits; AP as-at #229; receipt #230; 3-way #231; partial bill #232; void_date #233/#234; statement #235; payment void #236; copy-bill #243; supplier credit-limit #244; AP totals #255; save-authorise honesty #258 | Xero/Odoo AP / receiving / matching | Authenticated lifecycle + inventory COGS only with real layers |
| M-05 | Expenses & reimbursements | Partial | P1 | EM module + claims; OCR/payout provider gaps | Expensify/Xero expenses | Provider + approval depth |
| M-06 | Contacts | Partial | P1 | CRUD/duplicates/portals partial | Xero contacts | Portal isolation proof |
| M-07 | Products & Services | Partial | P1 | Non-inventory catalogue ready | QBO products | — |
| M-08 | Inventory & stock | **Missing layers / Intentionally Deferred** | P2 | No stock cost-layer tables; COA cogs subtypes + unused valuation setting only — **do not claim COGS** | Odoo Inventory, QBO Advanced | Build movement ledger before valuation |
| M-09 | Accounting / GL | Partial | P0 | Posting engine, periods, journals, health; journal reverse company/source gate #257 | All majors | Race/lock live proof |
| M-10 | Budgets & forecasting | Partial | P1 | Budgets + variance runners | Xero budgets | Fixture acceptance |
| M-11 | Fixed assets | Partial | P1 | Register/depreciation batches shipped | Xero assets, Odoo assets | GL recon certification |
| M-12 | Projects / timesheets / job costing | Partial | P1 | Projects + profitability + tagging; **timesheets Missing** | Xero Projects, Odoo timesheets | Timesheet billing |
| M-13 | Reports & analytics | Partial | P0 | Catalogue + AR/AP as-at + statements; some Depends entries | All majors | Historical AP release verify; AP browser E2E |
| M-14 | Tax & compliance | Partial | P0 | Packs/returns; e-filing Missing | HMRC MTD, ATO BAS | Jurisdiction engines |
| M-15 | Accountant tools | Partial | P1 | Period close / workpapers | QBO Accountant | Multi-client proof |
| M-16 | Firm / multi-client | Partial | P1 | Firm links/tasks | Xero HQ | Isolation tests |
| M-17 | CRM | Partial | P2 | Many sections live; later batches fail-closed | Odoo CRM | Close remaining fail-closed batches |
| M-18 | HR | Partial | P2 | Foundation; later batches fail-closed | Odoo HR | Batch backends |
| M-19 | Payroll | Partial | P2 | Basic Global Payroll; statutory filing Missing | Gusto/Xero Payroll | Filing providers |
| M-20 | Advisors / Advisors Portal | Partial | P2 | Routes/screens present | Practice suites | Delivery hardening |
| M-21 | Files & Documents | Partial | P1 | Attachments; malware/OCR limited | Receipt Bank concepts | Quarantine intake |
| M-22 | Messaging & Collaboration | Partial | P2 | Platform on main (#224/#226); voice/video fail-closed | Slack-like workspace tools | Provider optional |
| M-23 | Action Center / Notifications | Partial | P1 | Actionable alerts | Xero + | Delivery proof |
| M-24 | AI Assistant / voice | Partial / Blocked provider | P2 | Guidance paths; provider config required | Generic AI assistants | Keep fail-closed approvals |
| M-25 | Coding Memory | Partial (PR #225 draft) | P1 | Authorised bank coding memory | Bank rule learning concepts | Review/merge #225 |
| M-26 | Accounting Error Shield | Missing / discover | P1 | Not a registered module on main | Close checklists | Spec against ledger-health |
| M-27 | Live Close | Partial | P1 | Period-close / accountant live close checks | Month-end review tools | Harden + verify |
| M-28 | Mission Control | Missing / discover | P2 | Not registered as module | Ops dashboards | Spec or map to platform |
| M-29 | Financial Brain | Missing / discover | P2 | Not registered as module | Analytics suites | Spec after core GL |
| M-30 | App Store / integrations | Partial | P1 | Marketplace UI; many providers unavailable | Xero app store | Fail-closed until verified |
| M-31 | Developer Portal / API | Partial | P2 | Portal surfaces | Public APIs | Partner auth |
| M-32 | Settings Centre | Partial | P1 | Feature manager; honest unavailable states | All majors | Invite email |
| M-33 | Help & Support | Partial | P3 | Guides shell | — | Ticketing optional |
| M-34 | Auth / authz / onboarding | Partial | P0 | Supabase auth + RLS; invite delivery gap | All majors | Isolation E2E |
| M-35 | Subscription & billing | Partial | P1 | Platform billing routes | SaaS billing | Provider verify |
| M-36 | Platform / Superadmin | Partial | P1 | `/platform` | Internal admin | Access matrix |
| M-37 | Global search & navigation | Partial | P1 | Search + Create New | Xero search | — |
| M-38 | Mobile / responsive | Partial | P2 | Premium browsing in progress | Mobile apps | Device matrix |
| M-39 | Import / export / backup | Partial | P0 | Imports exist; PITR drill Missing | Migration tools | Backup drill evidence |
| M-40 | Audit / security / monitoring | Partial | P0 | Audit events; Sentry/uptime incomplete | — | Monitoring |
| M-41 | Public website / customer portals | Partial | P1 | Portal routes; payment gateway limited | Client portals | Isolation + payments |
| M-42 | Projects route registry | Partial | P2 | `/projects` exists; not in MODULE_REGISTRY sidebar | Job costing nav | Register hidden/sidebar deliberately |

## Detailed finding — Batch B1

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-AP-ASAT-001 |
| **Module / submodule** | Reports / Aged Payables |
| **Screen / route** | `/reports` → Aged Payables (`AgedView` kind=`ap`) |
| **Missing/incomplete** | Historical as-at used current `amount_paid_minor` / `amount_credited_minor` and refused non-today dates |
| **Existing evidence** | `payables-integrity.ts` prior guard; AR already had `ar-asat.ts` |
| **Competitor reference** | Public aged payables / as-at AP reports (Xero, QBO, Odoo) — capability only |
| **Business impact** | Month-end AP ageing disagreed with prior-period balance sheet |
| **Accounting impact** | Subledger vs AP control not reconstructible historically |
| **Security impact** | None new (reports.view + company membership) |
| **Priority** | P0 |
| **Complexity** | M |
| **Dependencies** | `allocated_on` columns; `cash_allocation_history` for deleted rows |
| **Proposed architecture** | Original LinkBooks pure `ap-asat` maths + server loader (parallel to AR as-at) |
| **Backend** | `getAgedPayablesAsAt` |
| **Database** | No new migration (reuse existing dated columns + archive) |
| **Frontend** | Reports `AgedView` uses as-at path; basis copy updated |
| **Tests** | `ap-asat.test.ts`, updated `payables-integrity.test.ts` |
| **Acceptance** | Past as-of includes bills paid after that date; unapplied payments/credits as negatives; currencies separate; future dates rejected |
| **Development status** | Implemented on branch `feature/ap-asat-historical-aged-payables` (`467b33e9`+); period-close as-at follow-up in same PR |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/229 |
| **Release verification** | Open — unit/module/`tsc` green locally; GitHub Actions fail with 0 jobs (commented `quality.yml`; restore via #227); staging not run |

## Detailed finding — Period close as-at (B1.1)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-CLOSE-ASAT-001 |
| **Module** | Accounting / Live close |
| **Missing/incomplete** | Period close called legacy aged AR/AP; after B1, AP rejected non-today `asOf`, so period-end lock checks broke |
| **Priority** | P0 |
| **Development status** | Implemented on #229 branch (`period-close-subledger` + PeriodClosePanel) |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/229 |
| **Originality** | Adapter reuses LinkBooks as-at contracts; no competitor UI/code |

## Detailed finding — PO goods receipt (B2)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-PO-RCV-001 |
| **Module / submodule** | Purchases / Purchase orders |
| **Screen / route** | `/purchases/orders/$orderId` |
| **Missing/incomplete** | `partially_received` existed in enum/filters but no receive quantities or action; convert blocked after receive |
| **Competitor reference** | Public PO receiving / goods receipt concepts (Odoo/Xero) — capability only |
| **Business impact** | Cannot track ordered vs received before billing |
| **Accounting impact** | None until bill authorised (receive is non-posting by design) |
| **Priority** | P0/P1 purchasing depth |
| **Complexity** | M |
| **Database** | `quantity_received` + `receive_purchase_order_goods` RPC; convert allows `partially_received` |
| **Frontend** | Received/outstanding columns; Receive remaining goods |
| **Tests** | `po-receipt.test.ts` |
| **Development status** | Implemented on `feature/po-goods-receipt-foundation-20261117` |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/230 |
| **Release verification** | Open — migration not applied to staging/prod in this session |

## Detailed finding — PO three-way match (B3)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-PO-3WAY-001 |
| **Module** | Purchases / Bills linked to PO |
| **Missing/incomplete** | `purchases.three_way_matching` setting existed but was unused; no order×receipt×bill check at authorise |
| **Competitor reference** | Public three-way matching capability (order/receipt/invoice) — concepts only |
| **Priority** | P0 |
| **Development status** | Implemented on `feature/po-three-way-match-20261117` (stacked on #230) |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/231 |
| **Originality** | Independent `po-three-way-match` maths; existing Settings registry key; no competitor UI/code |
| **Release verification** | Open — depends on #230 migration for receipt quantities; fail-closed when required and receipt data missing |

## Detailed finding — Partial bill-from-received (B4)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-PO-PBILL-001 |
| **Module** | Purchases / Purchase orders |
| **Missing/incomplete** | Convert billed full ordered qty regardless of receipt; no `quantity_billed`; blocked further receive after first bill |
| **Priority** | P0 |
| **Development status** | Implemented on `feature/po-partial-bill-from-received-20261117` |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/232 |
| **Originality** | Independent `po-partial-bill` maths; reuses existing convert RPC + bill authorise posting path |
| **Honesty** | No inventory/COGS valuation claimed; ledger posts only via bill authorisation |
| **Release verification** | Open — migrations #230/#B4 not applied live in this session |

## Detailed finding — Purchase bill void_date (B5)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-AP-VOID-001 |
| **Module** | Purchases / Bills |
| **Missing/incomplete** | `voidBill` reversed journals but did not store `void_date`/`void_reason`; `purchase_bills` lacked columns (sales invoices already have void_date) |
| **Priority** | P0 (historical AP as-at honesty) |
| **Development status** | Implemented on `feature/bill-void-date-20261117` |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/233 |
| **Originality** | Reuses LinkBooks `ReasonDialog` + sales void dating pattern; independent purchases helper |
| **Release verification** | Open — migration not applied live |

## Detailed finding — Supplier credit void_date (B6)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-AP-CRED-VOID-001 |
| **Module** | Purchases / Supplier credit notes |
| **Missing/incomplete** | `voidPurchaseCreditNote` reversed journals but did not require/store `void_date`/`void_reason` |
| **Priority** | P0 (historical AP as-at honesty) |
| **Development status** | Implemented on `feature/supplier-credit-void-date-20261117` |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/234 |
| **Originality** | Shared `assertPurchaseDocVoidDate` with B5; ReasonDialog reuse; no competitor code |
| **Release verification** | Open — migration not applied live |

## Detailed finding — Supplier statement opening balance (B7)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-AP-STMT-001 (P-24) |
| **Module** | Purchases / Supplier statements |
| **Missing/incomplete** | Opening balance existed but voids excluded; not shared with AR statement engine; no BBF line |
| **Priority** | P0 |
| **Development status** | Implemented on `feature/supplier-statement-opening-20261117` |
| **PR reference** | https://github.com/linkbusinessadvisory/LinkBooks/pull/235 |
| **Originality** | Reuses LinkBooks AR `buildCustomerStatement` with supplier nouns; no competitor code |
| **Release verification** | Open — unit tests; void_date columns improve void honesty when #233/#234 applied |

## Detailed finding — Supplier payment void_date + reason (B8)

| Field | Value |
|-------|-------|
| **Gap ID** | GAP-AP-PAY-VOID-001 |
| **Module** | Purchases / Supplier payments |
| **Missing/incomplete** | `reverse_supplier_payment` used void_date for journal reverse but did not persist `void_date`; UI hardcoded reason via `confirm()` (sales receipts already collect reason+date) |
| **Priority** | P0 (historical AP / supplier statement honesty; unlocks #235 void lines) |
| **Development status** | Implemented on `feature/supplier-payment-void-date-20261117` |
| **PR reference** | Pending open from this batch |
| **Originality** | Shared `assertPurchaseDocVoidDate` / ReasonDialog; extends existing RPC; no competitor code |
| **Release verification** | Open — migration not applied live |

## Acceptance questions (programme-wide)

All fifteen functional acceptance questions from the master addendum remain **open** at programme level. Module-level answers must be filled as each module reaches Complete and Verified — never inferred from UI presence alone.
