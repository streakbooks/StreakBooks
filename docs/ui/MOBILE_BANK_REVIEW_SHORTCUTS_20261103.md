# StreakBooks — mobile Banking review and keyboard navigation

Date: 3 November 2026. Scope: original StreakBooks UI, safe read-only review, no SQL/accounting changes.

## Delivered

### Mobile Banking transaction cards
- Under 768px, Banking > All transactions displays legible cards instead of a horizontally scrolled dense ledger table.
- Each card shows the **real** date, description, payee, amount in its account currency, status, bank account and transaction reference.
- Each card can be selected for existing bulk coding; the common selected-record action bar stays in place.
- **Preview** opens the existing read-only transaction review Sheet, including real linked journals.
- **Code** and **Match** switch to the existing coding/matching table for the selected transaction. No duplicate posting controls or parallel calculation engine.
- Other statuses provide **Manage**, switching to the complete table and its confirmation-controlled existing actions.
- **Table / Cards** toggles between the two views on mobile. Table remains the normal desktop experience. Only one representation is mounted at a time.
- Existing server pagination, search, sorting, filters, saved views, bulk coding, permissions, RLS and financial workflows are unchanged.

### Keyboard shortcuts
- When not typing in an input and no dialog is active, press **/** to focus Banking search. Enter submits the existing search.
- While a Bank transaction quick preview is open, **Left Arrow** reviews the previous transaction and **Right Arrow** the next within the current page.
- Shortcuts do not intercept Ctrl/Alt/Meta/Shift combinations, text entry, content-editable fields, or native browser shortcuts. Escape remains the standard dialog close.
- Pure unit tests verify shortcut contexts and browser shortcut preservation.

### Better automated checks
- The main GitHub quality workflow now runs the existing native-navigation audit and parses/discovers the authenticated Playwright suite as CI gates, in addition to TypeScript, changed-source ESLint, unit tests, and production build.
- A separate conditional `staging-browser` job runs real Chromium journeys on pull requests **only when explicitly configured**: repository variables `E2E_STAGING_ENABLED=true` and `E2E_STAGING_URL=https://...staging...`, plus secrets `E2E_STAGING_EMAIL` and `E2E_STAGING_PASSWORD`.
- This is opt-in to avoid sending test credentials or UI operations to unverified production deployments. The URL must use HTTPS; a dedicated staging account should have isolated sample data.
- The Playwright configuration now respects `E2E_BASE_URL` without starting a redundant localhost server. Without a configured staging target, the separate browser job is skipped; passing static discovery does **not** prove live browser functionality.

## Local test steps

In Cursor's PowerShell:
    cd D:\MyApp\StreakBooks
    git status
    git checkout main
    git pull origin main
    npm.cmd run dev

Preserve uncommitted local changes before pulling.

1. Sign in at http://localhost:8080 and open **Banking > All transactions**.
2. Resize the browser to 390px width. Confirm transaction cards show correct amounts and statuses from existing records.
3. Tap **Preview** on a card; use the left/right arrow keys to review adjacent records. Escape should close the preview.
4. Tap **Code** on an uncategorised card. Verify it transitions to the original table with that row's coding panel open; do not post a real transaction merely to test UI.
5. Tap **Cards** to switch back. Repeat with Match or Manage. Confirm the full table contains the original protected actions.
6. Select an uncategorised card and confirm the bulk-selected count and Clear selection work without creating journals.
7. Tap **Table** to toggle to the full data table, and **Cards** to return. On desktop the table should remain default.
8. While Banking is open and no input/dialog is focused, press **/**. Search should receive focus. Type a slash while the input is focused; it must insert text, not change focus.
9. Check browser back/forward, saved views, account/status/date filters and pagination.
10. Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` locally if desired.

## Scope/risks
- Mobile cards present only the current page of already authorized transactions (not a replacement for the entire list or universal infinite scroll). Existing server pagination remains.
- Actual authenticated Chromium testing and live Vercel visual acceptance are separate from static CI unless the staging job is configured and green.
- No posting rule, ledger, bank feed, Supabase migration, tax calculation, or document approval permission was changed.
- No Xero or Odoo source code, CSS, branding or images were copied.

## Follow-up
Use the staging Chromium job to validate cards and mobile coding flows against seeded sandbox accounts; expand E2E for 200-row pagination and keyboard accessibility, then add keyboard-first review queue metrics without risking financial accuracy.
