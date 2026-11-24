# StreakBooks Premium Website-Like Browsing — Development Roadmap

**Repository:** `streakbooks/StreakBooks`  
**ChatGPT development branch:** `feature/chatgpt-premium-browsing-20261107`  
**Cursor development branch:** `main` (keep isolated)  
**Status:** In progress; **not** production verified.

## Mandatory all-module scope

**This project is not restricted to Sales, Purchases, Contacts or Products.** The authoritative scope is [Full application coverage](./full-application-browsing-coverage.md), maintained by [the machine-readable module and route manifest](./all-module-browsing-manifest.json). The inventory is based on 21 sidebar modules, 132 authenticated route files including 15 supporting routes, and 11 explicit cross-cutting workflows. Every module, nested workflow, form, action, and future route must be covered and tested. The current implementation status is NOT complete for any module.

Run `npm run check:browsing-coverage` locally to flag routes or sidebar modules missing from the manifest. This is an inventory-only check; it does not verify application functionality. Preserve Cursor's `main` and continue using the feature branch only.

## Objective

Deliver an original StreakBooks browsing experience comparable in workflow completeness and usability to mature SaaS accounting applications without copying their distinctive visual assets, code, colours, or layouts.

This includes native browser navigation, discoverable module sections, connected record workspaces, correct form behavior, context retention, semantic feedback, accessibility, responsive performance, and accounting/security integrity.

## Current-state findings (source audit, not production validation)

| Requirement | Evidence observed | Remaining gap / verification |
| --- | --- | --- |
| Shared shell | `src/components/layout/AppShell.tsx` includes sidebar, company switcher, breadcrumbs, global search, Create New, alerts and theme controls | Responsive/authenticated browser coverage and module-wide visual consistency |
| Native links | `src/components/layout/AppShell.tsx` and `src/components/common/ModuleSubnav.tsx` use TanStack `Link` | Verify all modules, modified clicks, new tabs, deep links and Back/Forward |
| Scroll restoration | `src/router.tsx` has `scrollRestoration: true` | Verify filters, sorting, selections and route transitions across workspaces |
| Module subnavigation | Shared `ModuleSubnav.tsx` exposes all sections in a scrollable strip; Sales/Purchases/Banking reuse it | Authenticated/mobile validation, keyboard and responsive overflow checks |
| Purchases list state | Bills list URL search validates tab, query, dates, status, page, sort; bill record links now carry allowlisted return context | Run pure helper tests and seeded authenticated browser journey |
| Sales invoices list | `src/routes/_authenticated/sales/invoices.index.tsx` uses validated URL search; detail, New/Edit and mobile links preserve origin | Isolated helper assertions passed on exact Git blob; full build and authenticated browser journey still pending |
| Contacts directory | `src/screens/contacts/index.tsx` has URL-backed role, search, sorting and pagination; contact record detail carries validated origin through all 7 tabs | Standalone TypeScript compile and 36 isolated helper assertions passed against exact Git blob; full application/build/authenticated browser checks pending; advanced local filters are not yet URL-backed |
| Products & Services | `src/screens/products-services.tsx` uses native section links and URL-backed catalogue query, kind, category, status, sorting and pagination; section switching retains catalogue context | Standalone TypeScript compile and 29 isolated helper assertions passed against exact Git blob; full application/build/authenticated browser checks pending |
| Banking, Reports and other modules | Banking transaction and journal links retain filtered return context; Reports catalogue, saved views and management reports now preserve validated Reports Centre origins. | Full Banking/Reports workflows, remaining modules, authenticated browser and build checks still pending |
| Accessibility and performance | Shared controls include focus states and route preloading | Measure with realistic datasets and assistive technology checks |
| Finance/security | Existing accounting services, auth and Supabase RLS are separate | Never bypass posting, period locks, tenant isolation or authorization; regression test them |

## Changes already on the ChatGPT branch

- Shared module navigation improvement inherited from the common branch base: `src/components/common/ModuleSubnav.tsx`.
- `src/lib/purchases/bills-return-context.ts`: allowlisted, bounded, serialized Bills list state; no external redirects.
- `src/lib/purchases/bills-return-context.test.ts`: eight unit-test cases (written; not executed in GitHub connector).
- `src/routes/_authenticated/purchases/bills.index.tsx`: preserve list context in record navigation from table, preview and programmatic opening.
- `src/routes/_authenticated/purchases/bills.$billId.tsx`: restore context when returning to Bills.
- `e2e/module-subnav-browsing.spec.ts`: four authenticated browser scenarios (written; not executed).
- `src/lib/sales/invoice-list-navigation.ts`: validated, allowlisted invoice list URL state, safe return-context encoding/decoding.
- `src/lib/sales/invoice-list-navigation.test.ts`: nine Sales state unit-test cases (written; not executed).
- `src/routes/_authenticated/sales/invoices.index.tsx`: URL-backed filters, sort, pagination, overdue filter and record return links.
- `src/routes/_authenticated/sales/invoices.$invoiceId.tsx`, `src/routes/_authenticated/sales/invoices.$invoiceId.index.tsx` and `src/routes/_authenticated/sales/invoices.$invoiceId.edit.tsx`: preserve origin on detail/edit navigation.
- `src/routes/_authenticated/sales/invoices.new.tsx`, `src/screens/sales/invoices.new.tsx`, `src/components/sales/SalesDocumentEditor.tsx` and `src/components/sales/InvoiceMobileCards.tsx`: carry list context across new/edit, saving and mobile record links.
- `src/components/sales/ListKit.tsx`: allow 200-row page sizes already supported by saved views.
- `e2e/sales-invoice-browsing-context.spec.ts`: three authenticated Sales navigation tests (written; not executed).
- `src/lib/contacts/contact-view-navigation.ts`: safe allowlist of directory role/view names.
- `src/screens/contacts/index.tsx`, `src/routes/_authenticated/contacts/index.tsx` and `src/routes/_authenticated/contacts/$contactId.tsx`: preserve directory view when opening a record, switching detail tabs and returning.
- `src/lib/contacts/contact-view-navigation.test.ts`: four unit-test cases (written; Vitest not run).
- `e2e/contacts-directory-return-context.spec.ts`: two authenticated browser journeys (written; not executed).
- `src/lib/products/catalogue-navigation.ts`, `src/routes/_authenticated/products-services.tsx` and `src/screens/products-services.tsx`: validated bookmarkable Catalogue, Categories and Price Lists sections with native links.
- `src/lib/products/catalogue-navigation.test.ts`: three unit-test cases (written; Vitest not run).
- `e2e/products-section-browsing.spec.ts`: four authenticated scenarios for sections, filters, refresh, browser history and new-tab navigation (written; not executed).
- `src/lib/products/catalogue-navigation.ts`, `src/routes/_authenticated/products-services.tsx`, `src/screens/products-services.tsx`: full URL-backed catalogue filter and page state, context-preserving section links.
- `src/lib/products/catalogue-navigation.test.ts`: nine unit scenarios (written; not run with Vitest).
- `src/lib/contacts/contact-view-navigation.ts`, `src/routes/_authenticated/contacts/index.tsx`, `src/screens/contacts/index.tsx`, `src/routes/_authenticated/contacts/$contactId.tsx`: URL-backed directory search/sort/page and validated return context across all seven detail tabs.
- `src/lib/contacts/contact-view-navigation.test.ts`: nine unit scenarios (written; not run with Vitest).
- `src/routes/_authenticated/contacts/new.tsx`, `src/screens/contacts/index.tsx`, `src/screens/contacts/new.tsx`: carry validated directory search/sort/page context into New Contact, Back to Directory, and post-save contact detail.
- `e2e/contacts-new-return-context.spec.ts`: two authenticated browser scenarios covering list-origin restoration and untrusted return parameter stripping (written; not executed).
- `e2e/contacts-directory-return-context.spec.ts`: four authenticated browser scenarios (written; not executed).
- **Executed on exact Git source copies in an isolated Node + TypeScript 5.8.3 environment:** TypeScript standalone compilation passed for the Products and Contacts navigation helpers; 29 Products and 36 Contacts assertions passed (65 total in this development turn). Checks compare Git blob hashes against GitHub before execution. This is not a full app typecheck or Vitest run.
- **Executed in an isolated Node environment:** 40 assertions for the exact Git blob hashes of the Bills, Sales, and Contacts navigation helpers passed; 11 assertions for the Products section helper passed. This is NOT a full npm/TypeScript/build/Vitest/Playwright run.

- `src/lib/reports/centre-return.ts` and `src/lib/reports/search.ts`: allowlisted Reports Centre return tokens and report URL parsing.
- `src/components/reports/ReportShell.tsx`, `ReportCatalogue.tsx`, `ReportDirectory.tsx`, `ReportingHome.tsx`, `ReportLibrary.tsx`, `ManagementWorkspace.tsx`, `ReportFallback.tsx`, `src/routes/_authenticated/reports/`: native return-to-origin links and context propagation.
- `src/lib/reports/centre-return.test.ts`: nine new unit scenarios; `src/lib/reports/search.test.ts`: two test cases added (NOT RUN).
- `e2e/reports-centre-return-browsing.spec.ts`: three browser journeys (NOT RUN).
- `src/lib/banking/transaction-return.ts`, `src/routes/_authenticated/banking/transactions.tsx`, `src/routes/_authenticated/banking/journal.$journalId.tsx`: validated transaction origin through journal/reversals, preserving transaction preview filters.
- `src/lib/banking/transaction-return.test.ts`: eight new unit scenarios (NOT RUN).
- `e2e/banking-journal-return-browsing.spec.ts`: three browser journeys (NOT RUN).
- The current environment cannot clone GitHub directly (`Could not resolve host: github.com`); full app typecheck, lint, build, Vitest and Playwright remain **NOT RUN**. The connected GitHub tools were used to inspect and commit, and source-level consistency was checked.

- `src/lib/fixed-assets/register-navigation.ts`, `src/routes/_authenticated/fixed-assets.tsx`: allowlisted URL-backed register search, status, account/type, sort and native section context; saved filter views apply in one navigation update.
- `src/lib/fixed-assets/register-navigation.test.ts`: seven unit scenarios WRITTEN, NOT RUN. `e2e/fixed-assets-native-browsing.spec.ts`: three browser scenarios WRITTEN, NOT RUN.
- `src/lib/budgets/budget-navigation.ts`, `src/routes/_authenticated/budgets/index.tsx`, `src/routes/_authenticated/budgets/$budgetId.tsx`: budget list search URL and return-to-origin. Five unit scenarios and two browser scenarios WRITTEN, NOT RUN.
- `src/lib/notifications/notification-utils.ts`, `src/routes/_authenticated/notifications.tsx`: Action Center page grouping stored as URL state, preserving current filters and native history. Two unit scenarios added; one browser scenario WRITTEN, NOT RUN.
- No full `npm`/TypeScript/Vitest/Playwright execution or deployment verification is available in this connected GitHub-only session. Do not upgrade any module to fully verified from source checks.

- `src/lib/documents/files-navigation.ts` and `src/routes/_authenticated/files.tsx`: URL-backed file list search, record type, sort, page, folder, selected preview and workspace view; native folder breadcrumbs and document review links.
- `src/lib/documents/files-navigation.test.ts`: seven unit tests WRITTEN, NOT RUN; `e2e/files-native-browsing.spec.ts`: three authenticated browser scenarios WRITTEN, NOT RUN.
- Existing folders, uploads, attachments and bulk actions are unchanged on the server; organization access and authenticated browser regression still must be verified.

- `src/lib/dashboard/attention-navigation.ts`, `src/routes/_authenticated/index.tsx`, `src/components/dashboard/BookkeepingAttentionCentre.tsx`: native link-backed attention filters (All, Overdue, Due soon, Bank review), deep links, refresh and Back/Forward. Five unit cases and two browser cases WRITTEN, NOT RUN.
- `src/lib/accounting/journal-browsing.ts`, `src/lib/navigation/workspace-search.ts`, `src/routes/_authenticated/accounting.tsx`, `src/components/accounting/JournalsPanel.tsx`, `src/screens/accounting.tsx`: validated URL state for journal search, source, date range, sort and pagination; list context retained across 13 Accounting tabs. `src/routes/_authenticated/recurring-journals.tsx` returns to Journals. Eight unit and three browser cases WRITTEN, NOT RUN.
- `src/lib/ai/assistant-browsing.ts`, `src/routes/_authenticated/ai-assistant.tsx`, `src/screens/ai-assistant.tsx`: safe bookmarkable AI suggestion search/status while preserving reviewCase deep links; six unit and two browser cases WRITTEN, NOT RUN.
- No accounting posting, period-lock or AI approval/posting services were intentionally modified. Full app typecheck, unit suite, build, integration, authenticated browser, accessibility and RLS validation remain NOT RUN.

## Required acceptance criteria

1. **Modules:** All existing top-level and sub-navigation items resolve to their permitted page, preserve correct active section, and expose native anchors.
2. **Browser:** Back/Forward, refresh, deep links, Ctrl/Cmd-click, middle-click and open-in-new-tab remain native.
3. **List context:** Relevant search, filters, sorting, pagination, tab and scroll survive record open/return and browser navigation.
4. **Details:** Source transactions link to relevant contacts, payments, journals and reports, without losing originating context.
5. **Forms:** New/Edit Invoice, Bill, Contact, Product, Payment and other approved forms validate, save, recover errors and guard unsaved changes.
6. **UI design:** Distinct StreakBooks token system, accessible semantic accounting states, consistent toolbars, menus, responsive layouts and useful feedback.
7. **Security:** No navigation or UI workflow permits data access outside the current authorized organization or bypasses permissions/RLS.
8. **Performance:** Establish measurable baseline and improvements for route transitions, searches, tables, mobile and keyboard use.
9. **Automated checks:** Run local TypeScript, ESLint, unit, source navigation, UI contract, build, authenticated browser, accessibility and relevant accounting regression checks.
10. **Proof:** Report exact checks and results; written tests are not equivalent to executed tests, and merged code is not equivalent to deployed code.

## Planned 12 development batches — universal module coverage

| Batch | Scope (all subroutes, forms and workflows included) | Status |
| --- | --- | --- |
| 1 | Complete repository-wide feature/route inventory, PRD/HLD/LLD and design baseline | Route/sidebar inventory recorded; full UX feature audit pending |
| 2 | Original design system, themes/colour schemes, shared shell/sidebar/context navigation, global search and Create New | Shared navigation partly coded; not fully verified |
| 3 | Dashboard, Action Center/Notifications, Help, Profile, onboarding, workspace entry and role-sensitive flow | Dashboard attention queue now bookmarkable; Action Center grouping and Help partially coded; other workflows and runtime checks pending |
| 4 | All Sales and Purchases submodules, payment/credit/recurring/expense workflows, supplier and customer navigation | Partial invoice/bill browsing code; remaining work pending |
| 5 | Banking accounts, feeds, cash coding, imports, transfers, rules, reconciliation and related money workflows | Transaction/journal browsing improvements committed; remaining submodules and end-to-end tests pending |
| 6 | Contacts, Products/Services and requested inventory scope, Files/Documents, import centre, Projects | Contacts, Products and Files URL-backed navigation partly coded; imports, Projects and tests pending |
| 7 | Accounting, recurring journals, GL/COA/periods, Accountant workflows, Reports centre and report builder | Accounting journal list URL context and Recurring Journals return coded; Reports partly coded; remaining Accounting subworkflows and runtime checks pending |
| 8 | Tax, country support, Budgets, Fixed Assets, related accounting/report drilldowns | Budgets list-to-detail return and Fixed Assets register URL filters coded; Tax and remaining workflows unverified |
| 9 | Payroll and complete Expense Claims/Expense Management including approvals, reimbursements and payment integrations | Pending |
| 10 | Firm, Advisors administration, Advisors customer portal, engagement and billing/document workflows | Pending |
| 11 | AI Assistant/StreakBooks Signal, Settings, Platform/Superadmin, subscription billing, automation, integrations and localization | AI Assistant suggestion filters URL-backed; Signal, Settings, Superadmin and remaining workflows unverified |
| 12 | Every route/module cross-cutting end-to-end browser, security/RLS, accounting, performance, accessibility and release verification | Pending |

**Fully verified development batches: 0 / 12.** Work may be coded in several sub-batches; no full batch is complete until the entire scope is verified. All future modules must be added to the manifest, rather than excluded from these groups.

The denominator is provisional until the full feature inventory is reconciled. **Fully verified coding batches: 0 / 12**; don't increase this without actual checks and acceptance evidence.

**Next:** Execute `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:navigation`, `npm.cmd run check:ui`, `npm.cmd run check:browsing-coverage`, `npm.cmd test -- src/lib/sales/invoice-list-navigation.test.ts src/lib/purchases/bills-return-context.test.ts src/lib/contacts/contact-view-navigation.test.ts src/lib/products/catalogue-navigation.test.ts src/lib/reports/centre-return.test.ts src/lib/banking/transaction-return.test.ts`, and authenticated browser suites in an isolated local worktree. Fix any failures before considering a batch verified. Next coding priorities: Payroll, Tax, Accountant, Firm, Advisors, Advisors Portal and Settings, plus remaining advanced workflows in already-touched modules. Full app verification is mandatory before any module is declared ready. Browser tests require authenticated fixtures.

## Operating boundaries

- **Never commit to `main` from ChatGPT work.** Use the dedicated remote feature branch.
- Cursor is independently modifying local `main`; avoid merge/rebase/push operations that could interfere.
- No GitHub Actions/CI execution, production database changes or deployments.
- Preserve existing double-entry services, accounting integrity, permission checks and RLS.
- Prefer small reusable changes with browser and unit tests.
- Verify before calling a feature complete. If local test execution isn't available, mark the outcome **not run**.

## Useful local verification commands (in an isolated worktree)

```powershell
cd D:\MyApp\StreakBooks
git fetch origin feature/chatgpt-premium-browsing-20261107
git worktree add D:\MyApp\StreakBooks-ChatGPT origin/feature/chatgpt-premium-browsing-20261107
cd D:\MyApp\StreakBooks-ChatGPT
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run check:navigation
npm.cmd test -- src/lib/purchases/bills-return-context.test.ts src/lib/sales/invoice-list-navigation.test.ts src/lib/contacts/contact-view-navigation.test.ts src/lib/products/catalogue-navigation.test.ts
npm.cmd run build
```

Browser tests require authorized fixture credentials, a running app, and an isolated test environment. Do not run any workflows through GitHub Actions.

## Status report standard

Every batch: exact changed files and commits, acceptance results, local checks, failures, limitations, GitHub PR/merge status, deployment verification, next batch, and a visual progress bar **at the very end**. Separate coded, tested, merged and deployed progress.
