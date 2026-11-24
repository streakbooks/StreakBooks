# Fixed Assets — Batch 5: Portfolio dashboard, register columns and saved filters
Date: 2026-11-06. Authoritative repository: `streakbooks/StreakBooks`.
Source branch: `feature/fixed-assets-register-safety-ux-20261106`. Draft PR #111; **not merged or deployed**.

## Delivered in source

### Portfolio dashboard — Fixed Assets → Dashboard
- Company-wide read-only snapshot from the authorised register and the same as-at register balances already used by the Fixed Assets screen.
- Four summary metrics: active registered asset count, acquisition cost, accumulated depreciation recorded, and cost less recorded depreciation. Values are company-wide, not affected by register filter settings.
- Three activity indicators: assets acquired in the current calendar month, disposed during the month, and **possible overdue depreciation reviews**. An overdue indicator is not an accounting amount due and excludes non-depreciating, fully depreciated and current-month-start assets.
- Categorised cost by asset type with proportional bars using exact bigint aggregation; recent six acquired assets link to the actual asset details.
- Native links to the Register, Run depreciation, Reconcile to GL and Review bill purchases tabs.
- **Fail-closed reporting:** if any active asset has missing/invalid accumulated depreciation, do not compute an incomplete accumulated total, net book value or overdue count. The acquisition cost comes from the registered cost, not GL balances. This dashboard does not post, amend, or approve accounting entries.

### Desktop register layout
- The existing shared `useTablePrefs` hook and `table-prefs` validation are reused for company-browser-level column visibility and comfortable/compact density.
- Up to 12 columns: Asset, Status, Purchase date, Method, Type, Cost GL account, Cost, Residual, Accumulated, Net book value, Depreciated to and Actions.
- The Asset identity and Actions columns cannot be hidden. Mobile cards retain their compact stable layout; column visibility currently applies **only to the desktop table**.
- Columns are presentation controls, not access control or accounting filters. Exports remain the standard complete register with authoritative balances regardless of hidden screen columns, with that distinction explained to the user.

### Named saved filter views
- Save up to ten named views per signed-in user and organisation **on the current browser only**. Saved preferences include search, status, asset type, GL account, sort and direction.
- Apply, replace and delete named views using real controls; name and JSON validation fail closed, and stale/malformed storage records are ignored.
- Saved views do **not** change accounting data, permissions, the current company selection, or the saved column layout.
- Preferences use localStorage under a key scoped to the verified Supabase user id and active company id. There is **no cross-device sync**, central preferences database or migration. If the browser blocks storage or the session cannot be verified, saving is disabled with a message. Standard table layout preferences use a separate company-scoped browser key.

## Tests added but not run
- `src/lib/fixed-assets/portfolio-dashboard.test.ts`: active vs disposed vs future acquisition, monthly activity, category grouping, full depreciation, invalid/missing balance guard, bigint total.
- `src/lib/fixed-assets/saved-filter-views.test.ts`: save/replace/delete, invalid JSON, bounds, duplicate case-folded names and round-trip.
- Shared `table-prefs` parser/hook are reused; verify the existing table preference tests during local checks.

## Risk and limitations
- The dashboard contains read-only **registered asset** summaries, not final statutory or GL-reconciled balances. Manual journals, disposal mechanics, unregistered assets, asset type reclassifications and changes in historic mappings may create reconciling differences. Refer to Reconcile to GL and underlying journal details.
- Possible overdue depreciation is a review flag only; do not post depreciation automatically from dashboard counts.
- No backend database migration, immutable approval workflow or new posting logic was introduced.
- Asset register and bill review still load full permitted datasets into client memory; server-side pagination/filtering is a future scalability improvement for very large companies.
- Named filters are local to a browser and user, and may become obsolete when types/accounts are deleted. Column preferences are browser/organisation-scoped. App/browser logout does not remove local preferences automatically.
- GitHub CI and Actions must remain disabled by user instruction. PR remains draft pending local typecheck, lint, build, regression tests, browser, multi-tenant permissions and staging QA.
- The feature branch can be many commits behind `main` due concurrent work; do not merge without reconciling the current base and verifying tests.

## Manual review checklist
1. Dashboard company-wide figures are unchanged when register filters change.
2. Empty register, future purchases, disposed assets, and fully depreciated assets display meaningful states.
3. Missing as-of depreciation values explicitly disable derived financial totals.
4. Category cost bars, active counts, recent acquisition links and all four dashboard navigation links are correct.
5. Change desktop columns (including required columns), reset layout, select row density, reload and switch companies.
6. Switch to phone width; mobile cards remain accessible and unchanged by desktop column preferences.
7. Save/apply/overwrite/delete a named filter view; test search, type, account, status, sort and direction.
8. Test two signed-in users on the same browser, two companies and restricted browser storage.
9. Verify exports are complete even after hiding a table column and do not show estimated depreciation amounts.
10. Verify screen-reader labels, keyboard access, 320–390px mobile and tablet breakpoints, and regression of posting/permissions.

## Local verification — never trigger GitHub Actions/CI

Before switching branches, preserve all unfinished local Cursor files and inspect `git status`.

```powershell
cd D:\MyApp\StreakBooks
git status
git fetch origin
git switch feature/fixed-assets-register-safety-ux-20261106
git pull --ff-only origin feature/fixed-assets-register-safety-ux-20261106
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run check:navigation
npm.cmd run build
npm.cmd run dev
```

If not already tracking the remote branch, use `git switch --track origin/feature/fixed-assets-register-safety-ux-20261106`. Do not discard local edits. If switch is blocked, stash with a descriptive message before switching and restore deliberately later.

**Release state:** source implementation committed; local and browser verification **not executed**; draft and not merged.
