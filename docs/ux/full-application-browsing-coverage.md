# LinkBooks — Complete All-Module Premium Browsing Coverage

**This is the master coverage scope, not an assertion of implementation completion.**  
**Authoritative repository:** `linkbusinessadvisory/LinkBooks`  
**ChatGPT-only development branch:** `feature/chatgpt-premium-browsing-20261107`  
**Source audited:** `src/lib/nav.ts` and the authenticated route tree at `8935c7bd180d94d8539f75460f8542dffd648b5b`.

## Policy: no module, route, screen or functional workflow may be omitted

The website-like browsing initiative applies to **every** existing and future LinkBooks sidebar module, submenu, internal tab, list, detail, drawer, modal, form, workflow, report, permission-sensitive action, connected record and support page. All 12 agreed premium-browsing requirements apply to each area, not only Sales/Purchases/Contacts/Products.

The register below was derived from actual repository navigation and routes. These route file counts are **not** a percentage of feature completion: individual route files may contain many tabs and workflows, and some internal workspaces have no separate route. A module with a single route can still require extensive development.

**Inventory at source revision:** 21 sidebar entries, 132 authenticated route files (117 associated with sidebar modules and 15 supporting route files). **No fully verified module is yet established in this browsing project.**

## 1. Every top-level module — tracked without exception

| # | Module | Main route | Route files | Premium browsing status |
|---:|---|---|---:|---|
| 1 | Dashboard | `/` | 1 | Partial browsing code committed; not runtime-verified |
| 2 | Banking | `/banking` | 12 | Partial browsing code committed; not runtime-verified |
| 3 | Sales | `/sales` | 26 | Partial browsing code committed; not runtime-verified |
| 4 | Purchases | `/purchases` | 25 | Partial browsing code committed; not runtime-verified |
| 5 | Contacts | `/contacts` | 6 | Partial browsing code committed; not runtime-verified |
| 6 | Products & Services | `/products-services` | 1 | Partial browsing code committed; not runtime-verified |
| 7 | Accounting | `/accounting` | 1 | Partial browsing code committed; not runtime-verified |
| 8 | Action Center | `/notifications` | 1 | Partial browsing code committed; not runtime-verified |
| 9 | Files | `/files` | 1 | Partial browsing code committed; not runtime-verified |
| 10 | Budgets | `/budgets` | 2 | Partial browsing code committed; not runtime-verified |
| 11 | Fixed assets | `/fixed-assets` | 1 | Partial browsing code committed; not runtime-verified |
| 12 | Payroll | `/payroll` | 12 | Not yet verified for premium browsing |
| 13 | Reports | `/reports` | 3 | Partial browsing code committed; not runtime-verified |
| 14 | Accountant | `/accountant` | 1 | Not yet verified for premium browsing |
| 15 | Firm | `/firm` | 1 | Not yet verified for premium browsing |
| 16 | Advisors | `/advisors-admin` | 13 | Not yet verified for premium browsing |
| 17 | Advisors portal | `/advisors-portal` | 6 | Not yet verified for premium browsing |
| 18 | AI Assistant | `/ai-assistant` | 1 | Partial browsing code committed; not runtime-verified |
| 19 | Tax | `/tax` | 1 | Not yet verified for premium browsing |
| 20 | Settings | `/settings` | 1 | Not yet verified for premium browsing |
| 21 | Help | `/help` | 1 | Partial URL-backed search code committed; not runtime-verified |

**Status meaning:** "Partial browsing code" means some navigation/state improvements are committed; tests of the complete module are not finished. "Not yet verified" does **not** mean the existing module lacks functionality; it means this initiative has not established full coverage or acceptance.

## 2. Internal and supporting routes also included

- `src/routes/_authenticated/documents.branding.tsx`
- `src/routes/_authenticated/documents.print.$kind.$id.tsx`
- `src/routes/_authenticated/firm-invite.$token.tsx`
- `src/routes/_authenticated/imports.tsx`
- `src/routes/_authenticated/invite.$token.tsx`
- `src/routes/_authenticated/onboarding.tsx`
- `src/routes/_authenticated/platform.automation.tsx`
- `src/routes/_authenticated/platform.billing.tsx`
- `src/routes/_authenticated/platform.index.tsx`
- `src/routes/_authenticated/platform.operations.tsx`
- `src/routes/_authenticated/platform.tsx`
- `src/routes/_authenticated/profile.tsx`
- `src/routes/_authenticated/projects.tsx`
- `src/routes/_authenticated/recurring-journals.tsx`
- `src/routes/_authenticated/route.tsx`

These include documents/printing, invitations, onboarding, import centre, platform/Superadmin/billing, profile, projects, recurring journals and authenticated app structure. They are fully in scope even where they are not individual sidebar entries.

## 3. Cross-cutting and requested capabilities — explicit gap register

| Capability | Evidence or requested context | Required follow-up |
|---|---|---|
| Expense Management and Employee Claims | Purchases employee expenses route; requested separate standalone module | Navigation/product scope reconciliation required |
| Smart Action Center | Action Center sidebar maps to /notifications | Full approvals, alerts and actions unverified |
| LinkBooks Signal / voice commands | Voice components and form adapters are internal, not standalone sidebar items | Full command and keyboard accessibility coverage pending |
| Files and Documents | Files sidebar and supporting document printing/branding routes | Folder/inbox/attachments/print workflows unverified |
| Import Centre and Migration | imports.tsx and Contacts/Purchases/Banking import routes | All import types and errors unverified |
| Recurring journals and schedules | recurring-journals.tsx, Sales/Purchases recurring | Creation, scheduling, posting and notifications unverified |
| Platform Superadmin and subscription billing | platform.* routes, Settings and Advisors billing | Role gating, payments and operations unverified |
| Customer/supplier portals and invite/onboarding | advisors-portal.*, invite and firm-invite routes | Auth, handoff, back navigation and tenant tests pending |
| Global search and universal Create New | AppShell global search and creation entry points | Search context, exact amount, permissions and every destination unverified |
| AI Assistant integrations and external automation | AI Assistant and platform automation routes | Permissions, approvals, integration error cases and UX unverified |
| Regional tax, currencies and localization | Tax, Settings, accounting surfaces | Country-gated flows and currency/timezone formatting unverified |

**Important:** A requested standalone Expense Management top-level module is not represented by a separate top-level sidebar entry in this audited source. Employee expenses currently appear under Purchases. Treat the independent navigation requirement as an unresolved scope gap and do not claim that a standalone module already exists.

Other global capabilities to validate with each applicable module include: organisation switcher, multi-tenant authorization, RLS, profile, superadmin permissions, immutable accounting postings, FX, tax, saved views, accessibility, keyboard/voice navigation, files/attachments, notifications, responsive design and localization.

## 4. Universal acceptance checks — mandatory for every module, submodule and route

1. **Navigation:** Every visible menu/submenu/tab/action opens the correct authorized screen, including deep links, breadcrumbs and active-state indicators.
2. **Workspace continuity:** Consistent shell, page heading, context toolbar, module-specific actions, linked records and return-to-origin behavior.
3. **Browser semantics:** Native Back/Forward, refresh, direct URLs, Ctrl/Cmd-click, middle-click, open new tab/window, non-destructive URL search state.
4. **Context retention:** Preserve the relevant view, filters, search, sorting, pagination, scroll, selection and unsaved draft as appropriate, without exposing private data or unsafe redirects.
5. **Forms:** New/Edit/Detail routes, drawers and dialogs have complete validated fields, keyboard flows, feedback, warnings, permission checks and real persistence.
6. **Data-rich UX:** Practical information-density, tables, mobile cards, pagination/grouping/bulk actions, real drill-downs and accessible status.
7. **Original design:** Distinct LinkBooks light/dark tokens, colour schemes, typography, responsive spacing, focus states, predictable controls, no competitor copying.
8. **Feedback and resilience:** Loading/skeleton, empty states, errors, retries, optimistic state only when safe, confirmations and idempotency.
9. **Security:** Authentication, organization isolation, roles, no stale cross-tenant data, RLS and permissions on every feature.
10. **Accounting integrity:** Accurate double-entry, AR/AP links, immutable posted records, tax/FX/rounding, reversals and locked periods where relevant.
11. **Performance and accessibility:** Measured route/search/table responsiveness, keyboard and screen-reader acceptance, small-screen and reduced-motion flows.
12. **Real verification:** Unit + integration + build + lint + role/RLS + authenticated browser + relevant accounting regression + deployment readiness with recorded evidence.

**An item is completed only after its end-to-end acceptance checks are executed and recorded.** A route existing or source helper assertions passing cannot mark a module as complete.

## 5. Planned end-to-end work packages (12 provisional batches)

| Batch | Full scope (nested screens included) |
|---:|---|
| 1 | Repository-wide route and feature inventory; PRD, HLD/LLD, design decisions, gap evidence. **Inventory is started, not fully verified.** |
| 2 | Original LinkBooks design system, theme/colour schemes, shared shell, side/top/context navigation, keyboard, global search/Create New. |
| 3 | Dashboard, Action Center/Notifications, Help, Profile, onboarding, workspace entry and permission-sensitive entry flows. |
| 4 | Sales (invoices, quotes, orders, receipts, credit notes, recurring, statements, customers, reminders, settings) plus Purchases (bills, expenses, PO, payments, credit notes, employee expenses, recurring, suppliers, statements, inbox, settings). |
| 5 | Banking (accounts, feeds, imports, transfers, rules, transactions, cash coding, reconciliation, money documents, adjustments and reconciliation reports). |
| 6 | Contacts, Products & Services, catalogue categories/price lists, requested inventory boundaries, Files/Documents, import centre and Projects. |
| 7 | Accounting (COA, journals, GL, periods, balances), recurring journals, Accountant workflows and connected Reports/report builder. |
| 8 | Tax, regional packs, Budgets, Fixed Assets, performance/FX and accounting-linked drill-down experiences. |
| 9 | Payroll, Employee Expense Claims/Expense Management, connected reimbursements, payment exports and approval flows. |
| 10 | Firm, client/practice navigation, Advisors administration and full Advisors customer portal workflows. |
| 11 | AI Assistant/LinkBooks Signal, Settings Centre, billing/subscription, platform/Superadmin, automation, integrations, localization and every cross-cutting service. |
| 12 | All-module final gap audit: security, accounting integrity, permissions/RLS, desktop/mobile/keyboard/voice, performance, full automated and authenticated acceptance tests; deployment/recovery verification. |

Every batch may require multiple small implementation increments; do not rush a whole batch or mark it complete merely because initial code is committed. New modules and internal views discovered during audit must be added to the manifest rather than omitted.

## 6. Complete authenticated route file annex (source inventory)

### Dashboard — 1 route file

- `src/routes/_authenticated/index.tsx`

### Banking — 12 route files

- `src/routes/_authenticated/banking/cash-coding.tsx`
- `src/routes/_authenticated/banking/feeds.tsx`
- `src/routes/_authenticated/banking/import.tsx`
- `src/routes/_authenticated/banking/index.tsx`
- `src/routes/_authenticated/banking/journal.$journalId.tsx`
- `src/routes/_authenticated/banking/money-documents.tsx`
- `src/routes/_authenticated/banking/reconcile.tsx`
- `src/routes/_authenticated/banking/reconciliation-report.$sessionId.tsx`
- `src/routes/_authenticated/banking/route.tsx`
- `src/routes/_authenticated/banking/rules.tsx`
- `src/routes/_authenticated/banking/transactions.tsx`
- `src/routes/_authenticated/banking/transfers.tsx`

### Sales — 26 route files

- `src/routes/_authenticated/sales/credit-notes.$creditNoteId.edit.tsx`
- `src/routes/_authenticated/sales/credit-notes.$creditNoteId.index.tsx`
- `src/routes/_authenticated/sales/credit-notes.$creditNoteId.tsx`
- `src/routes/_authenticated/sales/credit-notes.index.tsx`
- `src/routes/_authenticated/sales/credit-notes.new.tsx`
- `src/routes/_authenticated/sales/customers.tsx`
- `src/routes/_authenticated/sales/index.tsx`
- `src/routes/_authenticated/sales/invoices.$invoiceId.edit.tsx`
- `src/routes/_authenticated/sales/invoices.$invoiceId.index.tsx`
- `src/routes/_authenticated/sales/invoices.$invoiceId.tsx`
- `src/routes/_authenticated/sales/invoices.index.tsx`
- `src/routes/_authenticated/sales/invoices.new.tsx`
- `src/routes/_authenticated/sales/orders.tsx`
- `src/routes/_authenticated/sales/quotes.$quoteId.edit.tsx`
- `src/routes/_authenticated/sales/quotes.$quoteId.index.tsx`
- `src/routes/_authenticated/sales/quotes.$quoteId.tsx`
- `src/routes/_authenticated/sales/quotes.index.tsx`
- `src/routes/_authenticated/sales/quotes.new.tsx`
- `src/routes/_authenticated/sales/receipts.$receiptId.tsx`
- `src/routes/_authenticated/sales/receipts.index.tsx`
- `src/routes/_authenticated/sales/receipts.new.tsx`
- `src/routes/_authenticated/sales/recurring.tsx`
- `src/routes/_authenticated/sales/reminders.tsx`
- `src/routes/_authenticated/sales/route.tsx`
- `src/routes/_authenticated/sales/settings.tsx`
- `src/routes/_authenticated/sales/statements.tsx`

### Purchases — 25 route files

- `src/routes/_authenticated/purchases/bills.$billId.edit.tsx`
- `src/routes/_authenticated/purchases/bills.$billId.tsx`
- `src/routes/_authenticated/purchases/bills.index.tsx`
- `src/routes/_authenticated/purchases/bills.new.tsx`
- `src/routes/_authenticated/purchases/credit-notes.$creditNoteId.tsx`
- `src/routes/_authenticated/purchases/credit-notes.index.tsx`
- `src/routes/_authenticated/purchases/credit-notes.new.tsx`
- `src/routes/_authenticated/purchases/employee-expenses.tsx`
- `src/routes/_authenticated/purchases/expenses.$expenseId.tsx`
- `src/routes/_authenticated/purchases/expenses.index.tsx`
- `src/routes/_authenticated/purchases/expenses.new.tsx`
- `src/routes/_authenticated/purchases/index.tsx`
- `src/routes/_authenticated/purchases/orders.$orderId.tsx`
- `src/routes/_authenticated/purchases/orders.index.tsx`
- `src/routes/_authenticated/purchases/orders.new.tsx`
- `src/routes/_authenticated/purchases/payments.$paymentId.tsx`
- `src/routes/_authenticated/purchases/payments.batch.tsx`
- `src/routes/_authenticated/purchases/payments.index.tsx`
- `src/routes/_authenticated/purchases/payments.new.tsx`
- `src/routes/_authenticated/purchases/portal-inbox.tsx`
- `src/routes/_authenticated/purchases/recurring.tsx`
- `src/routes/_authenticated/purchases/route.tsx`
- `src/routes/_authenticated/purchases/settings.tsx`
- `src/routes/_authenticated/purchases/statements.tsx`
- `src/routes/_authenticated/purchases/suppliers.tsx`

### Contacts — 6 route files

- `src/routes/_authenticated/contacts/$contactId.tsx`
- `src/routes/_authenticated/contacts/duplicates.tsx`
- `src/routes/_authenticated/contacts/import.tsx`
- `src/routes/_authenticated/contacts/index.tsx`
- `src/routes/_authenticated/contacts/new.tsx`
- `src/routes/_authenticated/contacts/settings.tsx`

### Products & Services — 1 route file

- `src/routes/_authenticated/products-services.tsx`

### Accounting — 1 route file

- `src/routes/_authenticated/accounting.tsx`

### Action Center — 1 route file

- `src/routes/_authenticated/notifications.tsx`

### Files — 1 route file

- `src/routes/_authenticated/files.tsx`

### Budgets — 2 route files

- `src/routes/_authenticated/budgets/$budgetId.tsx`
- `src/routes/_authenticated/budgets/index.tsx`

### Fixed assets — 1 route file

- `src/routes/_authenticated/fixed-assets.tsx`

### Payroll — 12 route files

- `src/routes/_authenticated/payroll/employees.$employeeId.tsx`
- `src/routes/_authenticated/payroll/employees.index.tsx`
- `src/routes/_authenticated/payroll/index.tsx`
- `src/routes/_authenticated/payroll/payments.index.tsx`
- `src/routes/_authenticated/payroll/payslips.$payslipId.tsx`
- `src/routes/_authenticated/payroll/payslips.index.tsx`
- `src/routes/_authenticated/payroll/reports.tsx`
- `src/routes/_authenticated/payroll/route.tsx`
- `src/routes/_authenticated/payroll/runs.$runId.tsx`
- `src/routes/_authenticated/payroll/runs.index.tsx`
- `src/routes/_authenticated/payroll/salary-structures.tsx`
- `src/routes/_authenticated/payroll/settings.tsx`

### Reports — 3 route files

- `src/routes/_authenticated/reports/$reportId.tsx`
- `src/routes/_authenticated/reports/builder/$viewId.tsx`
- `src/routes/_authenticated/reports/index.tsx`

### Accountant — 1 route file

- `src/routes/_authenticated/accountant.tsx`

### Firm — 1 route file

- `src/routes/_authenticated/firm.tsx`

### Advisors — 13 route files

- `src/routes/_authenticated/advisors-admin.appointments.tsx`
- `src/routes/_authenticated/advisors-admin.billing.tsx`
- `src/routes/_authenticated/advisors-admin.clients.tsx`
- `src/routes/_authenticated/advisors-admin.conversations.tsx`
- `src/routes/_authenticated/advisors-admin.documents.tsx`
- `src/routes/_authenticated/advisors-admin.engagements.tsx`
- `src/routes/_authenticated/advisors-admin.index.tsx`
- `src/routes/_authenticated/advisors-admin.inquiries.tsx`
- `src/routes/_authenticated/advisors-admin.onboarding.tsx`
- `src/routes/_authenticated/advisors-admin.settings.services-pricing.tsx`
- `src/routes/_authenticated/advisors-admin.staff.tsx`
- `src/routes/_authenticated/advisors-admin.tsx`
- `src/routes/_authenticated/advisors-admin.workspaces.tsx`

### Advisors portal — 6 route files

- `src/routes/_authenticated/advisors-portal.account.tsx`
- `src/routes/_authenticated/advisors-portal.appointments.tsx`
- `src/routes/_authenticated/advisors-portal.documents.tsx`
- `src/routes/_authenticated/advisors-portal.index.tsx`
- `src/routes/_authenticated/advisors-portal.messages.tsx`
- `src/routes/_authenticated/advisors-portal.tasks.tsx`

### AI Assistant — 1 route file

- `src/routes/_authenticated/ai-assistant.tsx`

### Tax — 1 route file

- `src/routes/_authenticated/tax.tsx`

### Settings — 1 route file

- `src/routes/_authenticated/settings.tsx`

### Help — 1 route file

- `src/routes/_authenticated/help.tsx`


### Supporting authenticated routes

- `src/routes/_authenticated/documents.branding.tsx`
- `src/routes/_authenticated/documents.print.$kind.$id.tsx`
- `src/routes/_authenticated/firm-invite.$token.tsx`
- `src/routes/_authenticated/imports.tsx`
- `src/routes/_authenticated/invite.$token.tsx`
- `src/routes/_authenticated/onboarding.tsx`
- `src/routes/_authenticated/platform.automation.tsx`
- `src/routes/_authenticated/platform.billing.tsx`
- `src/routes/_authenticated/platform.index.tsx`
- `src/routes/_authenticated/platform.operations.tsx`
- `src/routes/_authenticated/platform.tsx`
- `src/routes/_authenticated/profile.tsx`
- `src/routes/_authenticated/projects.tsx`
- `src/routes/_authenticated/recurring-journals.tsx`
- `src/routes/_authenticated/route.tsx`

## 7. Mandatory machine-check and development safeguards

- `docs/ux/all-module-browsing-manifest.json` is the machine-readable canonical source of all sidebar modules, route files and cross-cutting gaps.
- `npm.cmd run check:browsing-coverage` compares the manifest with actual `src/lib/nav.ts` and `src/routes/_authenticated/`. Newly added modules/routes not in the manifest fail inventory verification. **Passing this check does not verify functional completeness.**
- All ChatGPT code must remain on `feature/chatgpt-premium-browsing-20261107`; **never commit, merge or push to `main`**, where Cursor is independently working.
- Do not manually trigger GitHub Actions/CI, production deploys, or production DB changes.
- Keep code completion, local tests, authenticated browser tests, merge and deployment statuses separate.
- Work sequentially, avoiding duplicate work and keeping existing accounting functionality intact.
- Progress must be based only on verified batches, with a visual bar at the end of every update. Current **fully verified batches: 0/12**.

## 8. Current evidence / limitations

- 2026-11-07 Help browsing increment: `9a4181ca3ad6fc4569bd30da440b9d47131c87b3` replaces component-only search state with bounded URL query state for shareable searches, refresh, and native history continuity; `cca5b62160437ef50052286606a4cd358acaea48` records the manifest evidence. Help remains **not fully verified**; no local checks or authenticated browser tests were executed in this run. All 12 acceptance criteria remain open until tested.


- Navigation and context preservation code is committed for Dashboard, Banking, Sales, Purchases, Contacts, Products & Services, Accounting, Action Center, Files, Budgets, Fixed Assets, Reports and AI Assistant, with Help also recorded as partially coded, including shared navigation inherited in the branch history. Banking covers transaction-to-journal return and transaction previews; Reports covers catalogue, overview, management and saved-report return navigation. Neither module is fully verified.
- Standalone helper compilations and isolated assertions have been reported, but these do not demonstrate application-wide readiness.
- Full `npm run typecheck`, `npm run lint`, `npm run build`, full `vitest`, authenticated Playwright, tenancy/security and staging/deployment verification remain outstanding for this branch.
- The two branches have diverged; integrating into `main` requires a conflict review and explicit testing. No merge is authorized merely by this coverage policy.

**Completion definition:** Every sidebar module, supporting route, internal submodule and requested approved workflow has documented acceptance evidence; unresolved entries remain visible instead of disappearing from the plan.
