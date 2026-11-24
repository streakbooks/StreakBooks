# StreakBooks Development #11 — complete Dashboard and Bookkeeping Attention Centre

Date: 3 November 2026. Original StreakBooks implementation, informed by public Xero homepage customisation and Odoo accounting dashboard workflow concepts. No third-party source, protected assets or CSS copied.

## Deliverables — all eight requested items

1. **Advanced Dashboard UI:** Dedicated attention centre below the ledger-backed KPI row, refined responsive grid, optional compact spacing, accessible organisation-specific widgets.
2. **Bookkeeping Attention Centre:** Unified action panel with overdue and due-soon posted invoices/bills, uncategorised bank lines, outstanding drafts and approvals. Includes interactive All / Overdue / Due soon / Bank review filters and limited real-record preview.
3. **Receivables attention:** Real overdue invoice counts, due within seven days, outstanding amount per document currency, due date, customer, overdue age and direct full invoice links. Uses existing posting/outstanding logic.
4. **Payables attention:** Overdue/due-soon authorised supplier bill counts, supplier, due date and original-currency outstanding amount; approvals and draft bill shortcuts. Drafts do not count as posted AP.
5. **Bank attention:** Authorised company bank transaction preview of the six oldest uncategorised lines, amount in the source bank account currency and direct transaction-filter link. Existing bank reconciliations and mutation controls remain intact.
6. **Quick actions:** One-click links to original invoice, bill, bank transaction, approval and claim workspaces; Dashboard header includes a skip-to-attention anchor. No duplicate write APIs.
7. **Personalisation:** Drag handles for pointer reordering, accessible Move up/down buttons, show/hide, compact spacing, Overview/Collections/Bills & approvals/Banking presets, and up to eight named layouts. Preferences are keyed by signed-in user and selected company, browser-local. Existing v1 company-only widget selections are migrated for this user on first use. Browser storage contains only widget IDs/names/compact flag; never balances, documents or credentials.
8. **Testing and merge:** Pure tests for date boundaries, posted-only financial balances, currencies, queue limits, safe layout parsing, presets and ordering. Authenticated Playwright journeys for the attention queue and dashboard layouts are registered; optional staging smoke is also extended. TypeScript, changed-file ESLint, unit tests, native navigation audit, browser test discovery and production build must pass before any merge.

## Permissions and accounting integrity

- Existing `getDashboardSnapshot` remains company-member-checked.
- **Additional server-side `has_company_permission` checks** govern each *new record-level* attention preview: `sales.view`, `purchases.view`, `banking.view`, and `expenses.approve` for expense approval shortcuts. Missing permission hides the corresponding record previews and actions.
- Posted document requirements are enforced before amounts appear. Outstanding uses the existing sales/purchases shared line helpers, in integer minor units.
- The 7-day window includes today through day 7. Overdue means an earlier due date and positive outstanding. Counts include all qualifying records; the preview is deliberately limited. Different currencies are never summed.
- The attention centre is read-only. Posting, matching, invoice approvals, tax, RLS, finance schema and report code are unchanged. No Supabase migration required.
- Empty and permission-restricted workspaces show no fabricated transaction records.

## Manual acceptance in Cursor / PowerShell

First save/commit or stash any uncommitted local work. Then:

```powershell
cd D:\MyApp\StreakBooks
git status
git checkout main
git pull origin main
npm.cmd run dev
```

Open http://localhost:8080 (or the port shown in the terminal). Sign in and select a company with test invoices/bills/bank statements.

1. **Dashboard:** Confirm KPI row still shows real ledger data. The Bookkeeping Attention Centre should appear below it. Click Review tasks in the page header to jump there.
2. **Overdue receivables:** Check overdue invoice count against Sales → Invoices and open an overdue record; check due date, positive outstanding and document currency.
3. **Due soon:** Select the Due soon filter and inspect invoice/bill deadlines for the next seven days, including today. Zero/paid/unposted records should not show as actionable posted balances.
4. **Payables/approvals:** Check overdue bills and bills awaiting approval. The dedicated due-bills link should open the original Bills to-pay tab; the approvals shortcut should open For Approval.
5. **Banking:** Select Bank review. Open a bank record and verify it navigates to the existing Banking transaction list filtered to that line; test categorisation only in disposable staging data.
6. **Widgets:** Open Customize, apply Overview, Collections, Bills & approvals, Banking presets. Toggle individual widgets and compact spacing.
7. **Arrange:** Click Arrange; drag a widget handle into another position and use Move up/down controls as keyboard-accessible alternatives. Finish arranging.
8. **Saved layouts:** Save a custom name, apply another preset, load the saved layout, reload the page, verify persistence, and delete the saved layout. Switch to a different company and back to verify isolation. Browser-specific (not multi-device sync).
9. **Other modules:** Verify Sales/Bills/Banking retain existing pages, filters, approval checks and navigation. Test mobile (<768px), tablet and desktop widths.
10. **Quality:** Inspect GitHub Actions TypeScript, ESLint, unit tests, native navigation, Playwright discovery and production build statuses. Real authenticated Chromium remains pending until staging is configured (GitHub Issue #9).

## Limits and next steps

- Attention centre previews up to ten dated documents and six bank rows; counts cover all matching records based on existing, already fetched open-document population. Use full lists for the complete queue.
- Saved dashboard layouts persist in this browser only, per user and company. Multi-device synchronization would require a reviewed server preference API/schema change.
- There is no scheduler, automated email/SMS reminder, invented due-date forecast or mutating task completion state. The reminders are in-app read-only attention entries.
- Real authenticated browser acceptance and live visual confirmation cannot be claimed until the optional staging suite is configured and executed.
- Other Codex owns financial Reports and must avoid editing Dashboard files concurrently.

## Reference behaviour (functionality only)

- Xero Central: https://central.xero.com/0/article/Customise-your-Xero-dashboard (show, hide, reorder user-specific widgets).
- Odoo Accounting: https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/reconciliation.html (bank-review launch from accounting dashboard).
