# LinkBooks Premium Website-Like Browsing — Development Roadmap

**Repository:** `linkbusinessadvisory/LinkBooks`  
**ChatGPT development branch:** `feature/chatgpt-premium-browsing-20261107`  
**Cursor development branch:** `main` (keep isolated)  
**Status:** In progress; **not** production verified.

## Mandatory all-module scope

**This project is not restricted to Sales, Purchases, Contacts or Products.** The authoritative scope is [Full application coverage](./full-application-browsing-coverage.md), maintained by [the machine-readable module and route manifest](./all-module-browsing-manifest.json). The inventory is based on 21 sidebar modules, 132 authenticated route files including 15 supporting routes, and 11 explicit cross-cutting workflows. Every module, nested workflow, form, action, and future route must be covered and tested. The current implementation status is NOT complete for any module.

Run `npm run check:browsing-coverage` locally to flag routes or sidebar modules missing from the manifest. This is an inventory-only check; it does not verify application functionality. Preserve Cursor's `main` and continue using the feature branch only.

## Objective

Deliver an original LinkBooks browsing experience comparable in workflow completeness and usability to mature SaaS accounting applications without copying their distinctive visual assets, code, colours, or layouts.

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
| Reporting and other modules | Existing native navigation audit (`scripts/check-native-navigation.mjs`) covers key sections | Full screen/action inventory and real-browser testing |
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
- `e2e/contacts-directory-return-context.spec.ts`: four authenticated browser scenarios (written; not executed).
- **Executed on exact Git source copies in an isolated Node + TypeScript 5.8.3 environment:** TypeScript standalone compilation passed for the Products and Contacts navigation helpers; 29 Products and 36 Contacts assertions passed (65 total in this development turn). Checks compare Git blob hashes against GitHub before execution. This is not a full app typecheck or Vitest run.
- **Executed in an isolated Node environment:** 40 assertions for the exact Git blob hashes of the Bills, Sales, and Contacts navigation helpers passed; 11 assertions for the Products section helper passed. This is NOT a full npm/TypeScript/build/Vitest/Playwright run.

## Required acceptance criteria

1. **Modules:** All existing top-level and sub-navigation items resolve to their permitted page, preserve correct active section, and expose native anchors.
2. **Browser:** Back/Forward, refresh, deep links, Ctrl/Cmd-click, middle-click and open-in-new-tab remain native.
3. **List context:** Relevant search, filters, sorting, pagination, tab and scroll survive record open/return and browser navigation.
4. **Details:** Source transactions link to relevant contacts, payments, journals and reports, without losing originating context.
5. **Forms:** New/Edit Invoice, Bill, Contact, Product, Payment and other approved forms validate, save, recover errors and guard unsaved changes.
6. **UI design:** Distinct LinkBooks token system, accessible semantic accounting states, consistent toolbars, menus, responsive layouts and useful feedback.
7. **Security:** No navigation or UI workflow permits data access outside the current authorized organization or bypasses permissions/RLS.
8. **Performance:** Establish measurable baseline and improvements for route transitions, searches, tables, mobile and keyboard use.
9. **Automated checks:** Run local TypeScript, ESLint, unit, source navigation, UI contract, build, authenticated browser, accessibility and relevant accounting regression checks.
10. **Proof:** Report exact checks and results; written tests are not equivalent to executed tests, and merged code is not equivalent to deployed code.

## Planned 12 development batches — universal module coverage

| Batch | Scope (all subroutes, forms and workflows included) | Status |
| --- | --- | --- |
| 1 | Complete repository-wide feature/route inventory, PRD/HLD/LLD and design baseline | Route/sidebar inventory recorded; full UX feature audit pending |
| 2 | Original design system, themes/colour schemes, shared shell/sidebar/context navigation, global search and Create New | Shared navigation partly coded; not fully verified |
| 3 | Dashboard, Action Center/Notifications, Help, Profile, onboarding, workspace entry and role-sensitive flow | Pending |
| 4 | All Sales and Purchases submodules, payment/credit/recurring/expense workflows, supplier and customer navigation | Partial invoice/bill browsing code; remaining work pending |
| 5 | Banking accounts, feeds, cash coding, imports, transfers, rules, reconciliation and related money workflows | Pending |
| 6 | Contacts, Products/Services and requested inventory scope, Files/Documents, import centre, Projects | Partial Contacts/Products browsing code; remaining work pending |
| 7 | Accounting, recurring journals, GL/COA/periods, Accountant workflows, Reports centre and report builder | Pending |
| 8 | Tax, country support, Budgets, Fixed Assets, related accounting/report drilldowns | Pending |
| 9 | Payroll and complete Expense Claims/Expense Management including approvals, reimbursements and payment integrations | Pending |
| 10 | Firm, Advisors administration, Advisors customer portal, engagement and billing/document workflows | Pending |
| 11 | AI Assistant/LinkBooks Signal, Settings, Platform/Superadmin, subscription billing, automation, integrations and localization | Pending |
| 12 | Every route/module cross-cutting end-to-end browser, security/RLS, accounting, performance, accessibility and release verification | Pending |

**Fully verified development batches: 0 / 12.** Work may be coded in several sub-batches; no full batch is complete until the entire scope is verified. All future modules must be added to the manifest, rather than excluded from these groups.

The denominator is provisional until the full feature inventory is reconciled. **Fully verified coding batches: 0 / 12**; don't increase this without actual checks and acceptance evidence.

**Next:** Execute `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:navigation`, `npm.cmd run check:ui`, `npm.cmd test -- src/lib/sales/invoice-list-navigation.test.ts src/lib/purchases/bills-return-context.test.ts src/lib/contacts/contact-view-navigation.test.ts src/lib/products/catalogue-navigation.test.ts`, and authenticated browser suites in an isolated local worktree. Fix any failures before considering a batch verified. Next coding priorities: URL-backed Contacts advanced filters (including safe IDs and normalisation), contextual reporting drill-down and remaining cross-module return navigation. Browser tests require authenticated fixtures.

## Operating boundaries

- **Never commit to `main` from ChatGPT work.** Use the dedicated remote feature branch.
- Cursor is independently modifying local `main`; avoid merge/rebase/push operations that could interfere.
- No GitHub Actions/CI execution, production database changes or deployments.
- Preserve existing double-entry services, accounting integrity, permission checks and RLS.
- Prefer small reusable changes with browser and unit tests.
- Verify before calling a feature complete. If local test execution isn't available, mark the outcome **not run**.

## Useful local verification commands (in an isolated worktree)

```powershell
cd D:\MyApp\LinkBooks
git fetch origin feature/chatgpt-premium-browsing-20261107
git worktree add D:\MyApp\LinkBooks-ChatGPT origin/feature/chatgpt-premium-browsing-20261107
cd D:\MyApp\LinkBooks-ChatGPT
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
