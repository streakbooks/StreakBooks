# LinkBooks Premium Website-Like Browsing — Development Roadmap

**Repository:** `linkbusinessadvisory/LinkBooks`  
**ChatGPT development branch:** `feature/chatgpt-premium-browsing-20261107`  
**Cursor development branch:** `main` (keep isolated)  
**Status:** In progress; **not** production verified.

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
| Contacts directory | `src/screens/contacts/index.tsx` carries originating view to a contact; `src/routes/_authenticated/contacts/$contactId.tsx` keeps it across all 7 detail tabs | Directory-view helper passed 18 isolated assertions on exact Git blob; full app/browser validation pending; search/page retention remains to be implemented |
| Products & Services | `src/screens/products-services.tsx` uses native URL-based section links for Catalogue, Categories and Price Lists; `src/routes/_authenticated/products-services.tsx` validates search | Section helper passed 11 isolated assertions on exact Git blob; E2E browser checks pending; catalogue filters still local state |
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
- `e2e/products-section-browsing.spec.ts`: two authenticated native browser navigation scenarios (written; not executed).
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

## Planned 12 development batches

| Batch | Deliverable | State |
| --- | --- | --- |
| 1 | PRD, architecture/design inventory and approved original design baseline | Partial audit; not fully verified |
| 2 | Original shared design system and semantic status colours | Pending application-wide verification |
| 3 | Shell, module/sub-navigation, native browser interactions | Partial implementation; tests pending |
| 4 | Shared forms, tables, search, filters, saved views and context retention | Bills work in progress |
| 5 | Sales, invoices and receivables navigation/forms | Invoice URL/return-context code committed; tests and remaining flows pending |
| 6 | Purchases, bills and payables navigation/forms | Bills context implemented; tests pending |
| 7 | Products, Services, Inventory and Contacts | Contact view return context and Products section deep links committed; remaining workflows/tests pending |
| 8 | Banking, Accounting and Reports | Pending |
| 9 | Expense Management, Payroll, Tax, Fixed Assets and Budgets | Pending |
| 10 | Files, Projects, Accountant, Firm, Advisors, AI, Settings and remaining modules | Pending |
| 11 | Cross-module accounting, security, performance, accessibility and browser regressions | Pending |
| 12 | Final gap audit, recovery and production-release verification | Pending |

The denominator is provisional until the full feature inventory is reconciled. **Fully verified coding batches: 0 / 12**; don't increase this without actual checks and acceptance evidence.

**Next:** Execute `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check:navigation`, `npm.cmd run check:ui`, `npm.cmd test -- src/lib/sales/invoice-list-navigation.test.ts src/lib/purchases/bills-return-context.test.ts src/lib/contacts/contact-view-navigation.test.ts src/lib/products/catalogue-navigation.test.ts`, and authenticated browser suites in an isolated local worktree. Then fix failures before considering any batch verified. Next coding priority: Contacts and Products list search/filter/page URL context, cross-module drill-down and reporting return navigation.

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
