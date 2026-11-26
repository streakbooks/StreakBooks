# StreakBooks: Sales and Banking table appearance + invoice quick preview
Date: 3 November 2026.

## Why this batch
- Builds on PR #2 (navigation and dashboard personalization) and PR #3 (saved filter views).
- Purchases > Bills already contains server-backed list density, configurable columns and an existing bill preview. Reuse those patterns in Sales and Banking rather than replacing working accounting functionality.
- The user experience is original StreakBooks UI; Odoo and Xero are capability benchmarks, not code, assets, CSS or copied designs.

## Functionality implemented

### Sales > Invoices
- A consistent Columns menu with optional **Invoice date**, **Due date**, and **Outstanding balance**.
- A row density control with **Comfortable** and **Compact**, plus **Restore table defaults**.
- Per-user, per-company, per-browser preferences, backed by the existing validated useTablePrefs hook. Essential invoice number, customer, status, amount, and actions always stay visible.
- **Preview** button opens a read-only right-side panel, displaying the selected invoice's actual customer, date, due date, status, total and outstanding balance, calculated consistently with the invoice list. This panel offers a native link to **Open full invoice**.
- The preview cannot authorize, pay, edit, or otherwise mutate an invoice. All existing full-page accounting workflows stay in place.

### Banking > All transactions
- Matching Columns and density menus: optional **Bank account**, **Transaction status**, and **Linked journals**.
- Core transaction selection, date, description, amount, and action buttons stay visible. Bank account column is automatically omitted when already viewing a single selected bank account.
- Expanded coding/matching panels use a dynamic colspan matching the actual currently visible table columns; this avoids broken layouts when hiding optional fields.
- Bank reconciliation, posting, unmatching, exclusion, bulk coding, and provider behavior are not modified.

### Shared controls
- A reusable, keyboard accessible TableAppearanceControls component keeps the same affordances for Sales and Banking.
- Existing table-preferences hook gains a Restore defaults method. Settings remain browser-local and scoped by signed-in user and company.
- No additional requests or schema migrations; no accounting/business records are cached in preference storage.

## Automated validation
The GitHub Actions quality gate must pass: locked dependency installation, TypeScript, changed-file ESLint, full unit tests and production build. Authenticated Playwright scenarios were added but require a staging test user to run and are not part of this default CI gate. Vercel deployment and real-device visual acceptance must be checked separately.

## How to check locally
1. Open PowerShell in D:\\StreakBooks.
2. If local edits exist, commit/stash them safely before pulling: `git status`.
3. Run `git checkout main`, `git pull origin main`, and `npm.cmd run dev`.
4. Sign in at http://localhost:8080.
5. Open **Sales > Invoices**. Click **Columns** and hide **Due date**. Check the table header and cells disappear while Number, Customer, Status, Total and Actions remain.
6. Click **Comfortable** / **Compact** and verify row spacing changes. Refresh the page: the selected settings should persist. Click **Restore table defaults** to reset.
7. If invoices exist, click **Preview**. The panel opens without changing the URL. Verify amounts and customer against the list, then **Open full invoice** to inspect the real document.
8. Open **Banking > All transactions**. Use **Columns** to hide Linked journals and/or Status. Check Date, Description, Amount and Actions remain. Change density, refresh, restore defaults.
9. If there are test bank transactions, open Code or Match for an uncategorised row. Verify the expanded panel spans the full table width with columns hidden. Do **not** post or reverse a real transaction for visual testing.
10. Switch to a different company and confirm it has separate preferences. On mobile viewport, verify both menus remain reachable.

## Honest limitations
- Read-only preview uses the current invoice list payload, not the full invoice record; line items, attachments, journal details and mutating actions remain exclusively on the full invoice page.
- Preferences do not sync across devices or different browsers.
- The purchase Bills list already has its own server-backed density/column controls. It is intentionally unchanged here.
- Automated unit/build checks are not substitutes for an authenticated staging Playwright run and real user acceptance.
