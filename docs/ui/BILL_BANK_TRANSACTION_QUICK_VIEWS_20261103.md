# StreakBooks — Bills and Banking record quick views / selection clarity
Date: 3 November 2026
Branch: feature/record-quickviews-bulk-clarity-20261103

## Scope
This is an original StreakBooks usability increment informed by the speed and clarity of leading Xero/Odoo accounting workspaces. It does **not** copy either vendor's source, visuals, CSS or assets.

## Implemented

### Banking → All transactions
- Adds an icon-button **Preview transaction** to each transaction's existing action area, without replacing any Code, Match, Exclude, Unmatch or Restore actions.
- The accessible, read-only right-side drawer uses **authorised server-returned list data** to display transaction description, date, amount in the bank account's currency, status, account, payee, reference, contact, and exclusion reason when present.
- Displays the real linked journals, including reversed links, with native links to the current existing bank journal detail route.
- Adds **Previous / Next** to review bank rows on the current page without leaving the list. **View transaction in workspace** focuses the current item using the existing transaction URL filter.
- Closing the drawer does not mutate accounting state. Changing company, filter or page closes previews and clears selections.
- Existing bank coding, matching, reconciliation, bulk posting controls and financial calculations remain untouched.

### Purchases → Bills
- Enhances the **existing** bill Quick preview, rather than adding another drawer.
- Adds supplier invoice number, internal bill number, approval state, payment state, tax total, paid amount, credited amount and memo when present.
- Shows unposted paid/credited/balance fields as unposted rather than pretending to be posted ledger balances.
- Adds **Previous / Next** for bills visible on the current page. Retains the existing native link to the full document and actions.
- Preview closes when company or active list filters change; no stale company document can be presented via this list view.

### Reusable selected-record UI
- Introduces an accessible **SelectionActionBar** with selected count, non-destructive Clear selection, and optional caller-owned actions.
- Purchases and Banking adopt consistent selection presentation. Existing permission checks and posting handlers remain unchanged.
- Clear selection only clears the current browser selection; it does not code, authorize or modify records.

## Explicit safety and product limits
- Read-only previews show **current-page summaries**, not full document lines, bank statements or attachment contents. Full detail and editing remain on their existing routes.
- No SQL, RLS, Supabase migrations, billing integration, tax logic or financial journals were modified.
- Amount formatting reuses existing StreakBooks money formatting; currencies are never combined in a preview.
- The UI does not invent banking reference IDs, amounts, tax amounts or statuses.
- Authenticated browser E2E scenarios are checked in, but cannot be marked as executed until a staging login is available.
- GitHub CI checks TypeScript, changed-file ESLint, unit tests and production build. Full repository-wide lint debt remains a separate task.

## Manual acceptance at localhost
1. Update: open PowerShell in D:\\MyApp\\StreakBooks and run `git status`, `git checkout main`, `git pull origin main` and `npm.cmd run dev`.
2. Open http://localhost:8080 and sign in. Go to **Banking → All transactions**.
3. If transactions are present, click the **eye icon** beside any transaction. Confirm a right-hand drawer with its actual date, description, amount, bank account and status.
4. Inspect **Linked journals**. Follow a journal link if one exists, or confirm the empty state appears.
5. Click **Next / Previous** to inspect multiple rows, and press Escape to close. The transaction list URL should remain unchanged until a specific link is clicked.
6. If an uncategorised transaction exists, check its selection box. Verify the **Selected record actions** bar appears, then press **Clear selection** and confirm no coding operation occurred.
7. Go to **Purchases → Bills** and click a row's existing **Quick preview** (eye icon). Check supplier, document references, payment status, tax, paid/credited figures and memo.
8. Use **Next / Previous** for multiple bills on the current page. Close and confirm the list remains unchanged.
9. Change filter/page/company while a preview is open; the old record must not remain visible.
10. Verify previous Sales invoice previews, Saved views, custom columns and compact row density still work.

## Follow-on recommendation
- Add server-backed unified document preview with line items and attachments only after role-aware access and authenticated staging tests are available.
- Add keyboard shortcuts for record review, and improve row action overflow menus for smaller screens.
- Introduce richer, permission-controlled bulk review workflows with dry-run validation before financial posting.
