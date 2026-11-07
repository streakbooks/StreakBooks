# LinkBooks — All-module navigation, submenu and functional acceptance register

**Status as of 2026-11-07: NOT PRODUCTION-VERIFIED.**

Scope: every visible top-level module, every submenu, record list/detail, form, modal,
button, lookup, status, attachment, import/export, and cross-module workflow. This
register is a release gate, **not evidence that features are already implemented**.

## Definition of done for every module

1. **Navigation:** sidebar and all visible submenus have real destinations, correct active
   state, browser Back/Forward, refresh/deep-link, Ctrl/Cmd-click/new tab, keyboard focus,
   breadcrumbs, and permission-aware visibility. No placeholder links or dead controls.
2. **Visual:** independent LinkBooks design (competitors inform only requirements), responsive
   mobile/tablet/desktop, readable tables and long text, consistent themes and status badges,
   keyboard and screen reader navigation, loading/empty/error/disabled states.
3. **Functional:** every visible control runs the advertised operation with real server
   state, validation, error feedback, retry, optimistic-lock protection where applicable,
   truthful authorization and audit history. No fabricated data or inert buttons.
4. **Accounting:** financial transactions post correctly using balanced immutable journals,
   idempotency, correct AR/AP/bank/FX/tax/cash-accrual/period-lock behavior; no regression.
5. **Security:** tenant isolation, backend permissions and RLS, minimal data disclosure,
   secure third-party consent and tokens, authorization-bypass and abuse checks.
6. **Verification:** local TypeScript/lint/build/unit, per-module integration tests,
   authenticated cross-tenant browser journeys (mobile/tablet/desktop), staged migrations,
   regression testing and deployment checks with evidence and actual results.

## Canonical sidebar inventory — 24 distinct modules

| Top-level module | Route | Required submenus / workflows to accept | Verification |
| --- | --- | --- | --- |
| Dashboard | `/` | KPI accuracy, drill-down, links, date filters, company isolation | Not verified |
| Banking | `/banking` | Accounts, feeds, import, rules, transactions, transfers, cash coding, reconciliation and statements | Not verified |
| Sales | `/sales` | Quotes, invoices, recurring, credits, receipts, customers, payments, reminders, statements, sales orders | Not verified |
| Purchases | `/purchases` | Bills, purchase orders, expenses, supplier credits, recurring, supplier payments, statements, portal inbox | Not verified |
| Expense Management | `/expense-management` | Claim submission, receipts, mileage, approvals, policy, reimbursement, bank/GL posting | Not verified |
| Contacts | `/contacts` | Customers/suppliers, profile, history, search, duplicates, import, merge, linked documents | Not verified |
| Products & Services | `/products-services` | Catalogue, categories, prices, discounts, taxes, sales/purchase lookups | Not verified |
| Files | `/files` | Inbox, folders, upload, preview/download, document triage/history, move and permissions | Not verified |
| Accounting | `/accounting` | Chart of accounts, journals, ledger, opening balances, periods, FX, reversal, links and integrity | Not verified |
| Action Center | `/notifications` | Critical/action/unread queues, search, bulk actions, review links, read/archive/resolve | Not verified |
| Budgets | `/budgets` | Budget versions, periods, accounts, variance, drill-down, access and export | Not verified |
| Fixed assets | `/fixed-assets` | Register, categories, acquisition, depreciation, disposal, GL reconciliation, history | Not verified |
| Payroll | `/payroll` | Employees, pay runs, structures, settings, approvals, journals, reports and privacy | Not verified |
| Reports | `/reports` | All reporting tabs, standard/custom reports, cash/accrual, drill-down, delivery and export | Not verified |
| Tax | `/tax` | Rates and codes, jurisdiction rules, returns, calculation, reconciliation and exports | Not verified |
| Accountant | `/accountant` | Workpapers, exception resolution, reconciling items, journals, audit trail and approvals | Not verified |
| Firm | `/firm` | Client portfolios, onboarding, staff, roles, saved views, reviews and bulk actions | Not verified |
| Advisors | `/advisors-admin` | Inquiries, chats, booking, staff, proposals, billing, workspaces, documents and settings | Not verified |
| Advisors portal | `/advisors-portal` | Client onboarding, plan, appointments, secure messages, documents, tasks and billing | Not verified |
| App Store | `/app-store` | Browse, categories, app details, consent, connections, health, revocation, audit and verified sync | Not verified |
| Developer portal | `/developer` | API docs, app registration, OAuth permissions, webhooks, developer approval, keys, logs | Not verified |
| AI Assistant | `/ai-assistant` | Conversations, grounded insights, review-first journals, workpapers, audit and safe permissions | Not verified |
| Settings Centre | `/settings` | All categories, features, tax, documents, users, import, billing, integrations and unsaved forms | Not verified |
| Help | `/help` | Help search, documentation, contextual guidance and real support actions | Not verified |

**Aliases in user requests:** “Smart Action Center” refers to the existing Action Center at
`/notifications`; duplicate “Files” and “Accounting” entries are counted once.
Developer portal is labelled “Developer” in the current sidebar. Renaming a
module or introducing a second workspace requires an explicit route/product decision.

## Evidence and audit commands

```powershell
cd D:\MyApp\LinkBooks
git pull --ff-only origin main
npm.cmd run check:navigation
npm.cmd run check:ui
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/nav-coverage.test.ts
npm.cmd run test:navigation
npm.cmd run test:ui
npm.cmd run build
```

`check:navigation` verifies actual source links for selected key workflows and now
also requires all 24 sidebar destinations to exist in the generated router. The
`nav-coverage.test.ts` file guards every top-level label, route and nested active-state.
**These source-level checks cannot prove submenu functionality or backend correctness.**

For each module record: code commit/PR, tested submenu paths, actual unit and browser
results, two-organisation isolation checks, Supabase migration status, issues resolved,
staging proof and deployment confirmation. Count a module as **verified** only after all
applicable checks have passed.

## Release blockers and sequencing

- First run navigation, TypeScript, lint, unit, UI and build checks locally; investigate failures.
- Map every actual submenu and command, then run positive, negative, unauthorized and
  back/forward/deep-link browser journeys, including keyboard/mobile/desktop.
- Exercise real company-isolated database workflows and cross-module accounting postings.
- Explicitly verify App Store connectors; marketplace cards and connection status badges do
  **not** establish successful provider OAuth, sync, security testing or production readiness.
- Record proof for each module separately. Do not declare completion from PR merges alone.
