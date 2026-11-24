# StreakBooks workspace-navigation upgrade — 3 November 2026

## Independent product reference review

- **Xero**: its navigation/homepage improvements prioritise simpler labels, clearer grouping, a customizable homepage and actionable tasks. See https://www.xero.com/au/campaign/new-homepage-navigation/ and https://blog.xero.com/product-updates/xerocon-2025-new-features-announcement/.
- **Odoo**: filter/group/favourite workflows reduce time spent finding records. See https://www.odoo.com/documentation/19.0/applications/general/search.html. These are behavioural references only, **not code or visual assets copied from Odoo**.
- **StreakBooks**: existing AppShell, module nav, command palette, company switcher and contextual settings provide a sound basis. We retain TanStack links, accounting services, route structure, and per-company authorization.

## Dashboard personalization (additional delivered feature)

- Users can customize their dashboard by showing or hiding eight existing ledger-backed widgets: cash flow, bank accounts, receivables ageing, payables ageing, profit, approvals, watchlist and tasks.
- Choices persist in the current browser by company ID. There are no mock financial numbers, no new queries, and no modifications to the accounting engine.
- The four primary financial KPI cards and getting-started checklist remain visible to preserve vital financial context.
- A **Show all widgets** reset and an informative empty state are provided.
- Browser coverage includes choosing a widget, refreshing and resetting the selection.

## Delivered in this increment

1. Sidebar search filters actual modules using their name and description. Empty query restores all modules; no match is announced accessibly.
2. Native sidebar links gain a user-controlled pin/unpin action with up to eight browser-local favourite destinations, with no new database or tenant access.
3. The most recently visited four top-level module destinations appear as shortcuts. Favourite and recent links do not duplicate their normal group entries in the expanded sidebar.
4. Groups can be collapsed to reduce scanning overhead. Searching temporarily exposes matching groups.
5. Original URL semantics remain: browser Back/Forward, middle-click, Ctrl/Cmd-click and native tab opening still use TanStack links. The collapsed sidebar and mobile drawer still have their original navigation.
6. Reduced-motion preference disables sidebar link transition; icons and active route styles remain usable with keyboard focus.

## Explicit limitations

- These shortcuts are **per browser**, not synced across accounts or devices. They contain only fixed, permitted UI route identifiers, not financial data or arbitrary URLs.
- This work does not implement Xero's customizable dashboard widgets or Odoo's saved record filters. Those need separate scoped iterations.
- A visible navigation link does not grant server access: existing server permission checks and Supabase RLS remain authoritative.
- No changes to billing, finance calculation, SQL schema, API, secrets, deployment or third-party integrations.

## Verification

Run from the project root:

~~~sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
E2E_EMAIL=your-authorized-test-user E2E_PASSWORD=your-test-password npm run test:e2e -- e2e/native-navigation.spec.ts
~~~

The authenticated browser test requires a dedicated authorized test user and working test environment. Do **not** commit these credentials. GitHub checks or local test execution must pass before merging.

## Manual walkthrough

1. Open http://localhost:8080 while signed in; check the left navigation search.
2. Type **depreciation**: only matching destinations, including **Fixed assets**, should remain.
3. Clear the search; hover/focus Sales and click **Pin Sales**; it appears under Favourites.
4. Open a Sales or Banking route, return to Dashboard, and confirm Recently visited.
5. Refresh the browser to verify favourite/recent persistence. Click **Unpin Sales** to remove it.
6. Click the **Money** group title to collapse/reopen it.
7. Collapse the sidebar and check tooltips. At mobile width, open the drawer and check search and group links.
8. Verify opening Sales in a new tab with Ctrl/Cmd-click or middle-click still works.
9. On Dashboard click **Customize**; uncheck **Bank accounts**, close and refresh; the panel should stay hidden. Click **Show all widgets** to restore it.
10. Switch companies and verify each company remembers independent widget selections.
11. Check critical invoice and bank pages for unchanged accounting totals and posting actions.

## Follow-on Xero/Odoo-inspired, StreakBooks-original UI roadmap

- **Next**: richer dashboard personalization including card ordering, multiple saved views, responsive presets and attention-based highlights. The initial show/hide personalization is already implemented with real ledger-backed data.
- **Then**: reusable record list workspace with saved filters, sort, group, column visibility, pagination and bulk action permissions.
- **Then**: complete document detail pattern with linked postings, corrections, attachments and consistent status/action hierarchy.
- **Then**: practice/firm navigator, global task workspace, user preference synchronization and performance budgets.

All further modules require independent functionality and regression acceptance; never ship empty navigation pretending the financial workflow is complete.
