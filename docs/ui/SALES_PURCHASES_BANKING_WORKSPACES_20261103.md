# LinkBooks — Sales, Purchases and Banking workspace upgrade

Date: 3 November 2026.

## Independent Xero and Odoo benchmark

- Xero provides rich search, date/status filters, sortable lists and streamlined bill quick views. Official references:
  - https://central.xero.com/0/article/Search-invoices-bills-quotes-credit-notes-and-purchase-orders
  - https://blog.xero.com/product-updates/quick-view-manage-bills/
- Odoo supports saved search favourites, filters and groupings:
  - https://www.odoo.com/documentation/19.0/applications/general/search.html
- All new LinkBooks components are original React/TypeScript. No competitor source, styles, images or logos were copied.

## Working functionality added

### Sales / Invoices
- Quick filters: Overdue, Drafts, Partly paid.
- Saved views record search, status, date range, sort column/direction, page size and overdue selection.
- Each invoice row has an explicit Open action linked to its existing record page.
- Clear filters restores the standard invoice list.

### Purchases / Bills
- Quick filters: Awaiting approval, To pay, Overdue.
- Saved views record current workflow tab, search, date range and type, void/overdue status and sort.
- Applying a saved view resets pagination; existing selection reset protects bulk actions.
- Existing column customisation, bill preview, approvals and export are unchanged.

### Banking / All transactions
- Quick filters: For review, Unreconciled, Money out.
- Saved views record bank account, transaction status, status group, search, dates, direction and page size.
- Applying saved views clears a record-specific transaction ID, resets pagination and clears selection.
- Posting, matching, unmatching and reconciliation behavior is unchanged.

## Safety and limitations

- Eight saved views maximum per signed-in user, company and workspace on the current browser.
- View names have a 48-character limit. Reusing a name updates the saved view.
- Only schema-allowlisted and validated filters are persisted; no transaction records, amounts, credentials or accounting operations are stored in saved views.
- Server and Supabase RLS permissions remain authoritative; browser preferences do not grant access.
- No SQL migrations, financial posting rules, bank feed providers, payment logic or production data changed.
- Saved views do not yet sync across browsers, members or devices. Shared views and advanced AND/OR filters require additional work.

## Local verification

From PowerShell in D:\MyApp\LinkBooks:

    git checkout main
    git pull origin main
    npm.cmd ci
    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd test
    npm.cmd run build
    npm.cmd run dev

The PR CI checks changed-source ESLint (due to old unrelated lint debt), full TypeScript, unit tests and production build. A full npm run lint may still report prior formatting errors outside the changed code.

### Manual test in http://localhost:8080

1. Sign in, open Sales > Invoices, choose Overdue, then Saved views > enter a name > Save.
2. Switch to Drafts, open Saved views and apply the saved Overdue view. Use Clear filters, and click Open on an invoice.
3. Refresh and confirm the saved view still exists. Use the trash icon to delete it.
4. Open Purchases > Bills, choose Overdue and save a view. Switch tabs and restore it. Check browser URL and pagination.
5. Open Banking > All transactions, choose Money out and a bank account, save a view, switch filters, then restore.
6. Verify a bank transaction selected via global search does not remain selected after restoring a saved view.
7. Try mobile-width browser, keyboard Tab/Enter, and Ctrl/Cmd-click on document links.
8. Check separate companies have separate saved views. Do not approve/pay real documents just to test the UI.

Authenticated Playwright tests have been added to e2e/native-navigation.spec.ts but require a dedicated authorized staging user. Those must not be described as passing unless executed.

## Next UI priorities

- Unified safe record previews and linked journal navigation.
- Consistent column chooser and row density controls in Sales and Banking.
- User-synced and permission-aware shared views, richer filter combinations, bulk operations and performance measurements.
