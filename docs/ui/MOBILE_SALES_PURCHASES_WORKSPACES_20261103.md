# LinkBooks — responsive Sales and Purchases workspaces

Date: 3 November 2026

## Scope

This is a new, original LinkBooks implementation of accessible mobile accounting lists. It follows the same progressive disclosure used by our Banking cards. It does not copy Xero/Odoo source or visual assets.

## Working functionality

**Sales → Invoices:** On phone-sized viewports (under 768px), the list shows responsive invoice cards with actual invoice number, customer, issued/due dates, status, totals and outstanding balance in the invoice currency. Overdue status uses the same shared rule as the desktop list. Each card has Preview and native Open invoice actions. The existing line-item/attachment preview, search, saved views, CSV export, date/status filters and server pagination are unchanged. A Cards/Table control switches back to the full existing desktop table on mobile.

**Purchases → Bills:** Mobile bill cards display supplier, document reference, bill/due dates, status, total and outstanding AP (unposted drafts are explicitly labelled Unposted). Each card supports the existing Quick preview, Open bill, attachment navigation and a selection checkbox connected to the existing selected-bills and authorized bulk action bar. The existing approval/payment workflows, separate-currency totals, saved filters, supplier bill columns, density settings and pagination are unchanged. A Cards/Table control switches to the full original bill list.

**Consistency:** Both modules use the same accessible Cards/Table toggle. Cards are shown on mobile by default; tables remain the default on desktop. Only one presentation of records is mounted at a time. No data duplication or new financial mutation surface.

**Accounting safety:** Invoice outstanding and overdue display rules are moved to a shared pure helper used by both cards and the original invoice table. Unit tests cover authorized/partly paid/draft/paid/void invoices, fully paid and overdue amounts. The implementation does not change posting, journal queries, payments, tax calculations, Supabase or row-level security.

## Tests and evidence

The GitHub Actions workflow should pass TypeScript, changed-file ESLint, unit tests, navigation audit, Playwright scenario discovery and production build before merging. New authenticated browser scenarios cover mobile view switching, invoice preview, bill preview and selected-bill clearing. The opt-in actual staging Chromium smoke suite now also checks both mobile modules; it cannot be counted as run without configured, isolated staging.

## Check on your Windows PC

1. Preserve any uncommitted files. In Cursor PowerShell run:

```powershell
cd D:\MyApp\LinkBooks
git status
git checkout main
git pull origin main
npm.cmd run dev
```

2. Sign in at http://localhost:8080 (or use the port printed by the dev server). Resize browser to 390px wide (Chrome F12 → device toolbar).
3. Open **Sales → Invoices**. With invoices in the selected company, check card totals, customer and overdue labels; press Preview and Open on a test invoice. Tap Table to view the original table, then Cards to return. Verify saved views and Next/Previous page still work.
4. Open **Purchases → Bills**. Check supplier, invoice reference, total and outstanding AP. A draft should say Unposted instead of pretending to have posted AP.
5. Choose Select on a test bill, verify the selected-record bar counts it, then click Clear selection. Do not authorise real bills merely to test UI.
6. Open a bill's Preview; check line items and attachments. Tap Open or the attachment button to reach the original full document.
7. Switch Bills from Cards to Table and back. Check approval tabs, dates, saved views, list pagination and compact/comfortable density.
8. Resize to desktop (≥768px). Both modules should show their original tables. Verify Banking still shows the previous mobile cards/table workflow.

## Remaining limits

- Cards show only the currently authorized server page, not an infinite scrolling ledger. Filters, sorting and pagination remain server-based.
- The narrow-screen layouts are covered by code/test discovery but have not been visually approved on an actual staging/browser/device until those tests run.
- This change does not modify shared views, billing APIs, tax engines or production financial data.

## Recommended subsequent iteration

Once staging Chromium is activated, build a structured cross-module bookkeeping review queue with due/overdue attention metrics and direct record navigation, using existing permission-checked data.
