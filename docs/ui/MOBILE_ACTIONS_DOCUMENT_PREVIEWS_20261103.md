# StreakBooks: mobile row actions and richer Sales/Purchases document previews

Date: 3 November 2026. Feature branch: feature/mobile-row-actions-document-previews-20261103.

## Functionality implemented

### Sales → Invoices
- The existing read-only invoice preview now loads actual invoice line descriptions, quantities, unit prices, net amounts and taxes using the existing getInvoice server endpoint.
- Attachments are listed by their real file names and sizes; clicking Download uses the existing permission-checked attachment download endpoint and helpers.
- The invoice summary, full invoice navigation and posting history remain linked to their original financial workflows.
- In the list, optional date, due date and outstanding columns are hidden automatically at narrow widths (still configurable on desktop). Essential number, customer, status, total and sticky Actions remain available.

### Purchases → Bills
- The existing bill preview now loads full supplier bill line items and file metadata from the existing permission-enforced getBill and listAttachments server endpoints.
- Attachments can be downloaded using the existing signed/inline attachment download workflow, not new public storage URLs.
- The supplier, financial amounts, approvals, notes, full document link and Previous/Next navigation from the last batch are preserved.
- No changes to posted journal entries, approvals, calculations, VAT/GST or payments.

### Banking → All transactions
- The crowded row actions are condensed. The primary Code and Match actions stay available, with Match also present in the More menu on narrow screens.
- Exclude, Unmatch, Remove & redo and Restore are grouped under a More actions menu.
- Financially significant actions retain a confirmation dialog with an explanation. On confirmation, the same pre-existing protected server mutations run; there are no new posting endpoints.
- Account and linked-journal columns automatically disappear on mobile while transaction date, description, amount, status and a sticky Actions column remain visible. The Banking quick preview retains account, journals and full history links.
- Selection, reviews and open confirmations are reset when company, filters or page change.

## Safety and architecture
- New document preview data comes from existing authenticated Supabase-backed GET server functions and company-scoped queries. Attachment download uses existing signed URL / inline download checks.
- No newly privileged API, SQL migration, RLS adjustment, posting logic or bank mutation implementation.
- UI and interaction are independently written StreakBooks components; Odoo/Xero are capability references, not copied source or assets.
- No invoice/bill full-page editor changes. Preview fields are read-only.

## Manual verification

In PowerShell:
    cd D:\MyApp\StreakBooks
    git status
    git checkout main
    git pull origin main
    npm.cmd run dev

Open http://localhost:8080 and sign in.

1. Sales > Invoices: click Preview beside any invoice. Verify the Line items section (descriptions, qty, amounts, tax) and Attachments section. For an attached file, Download should trigger the existing authorized flow.
2. Open full invoice and check its line-item figures match the preview. Do not approve/post documents merely to test UI.
3. Purchases > Bills: open Quick preview. Check bill lines and attachments, download a test file if available, and use Previous/Next.
4. Banking > All transactions: for an uncategorised bank line, Code remains a primary action and Match appears both on desktop and inside More on mobile.
5. Open More and choose Exclude from review, then Cancel. Verify the line remains unchanged. Match/Unmatch/Remove & redo must continue to show confirmation before any postings.
6. At 390px viewport check mobile banking/ invoice table layout. Core amounts and actions stay available; account/journal columns are hidden on mobile but available in quick preview.
7. Switch company or change filters and verify previews and stale selections close. Check that other accounting modules function normally.

## Automated checks
GitHub Actions gates: npm ci, TypeScript, changed-source ESLint, unit tests, production build. Authenticated Playwright E2E scenarios are checked into e2e/native-navigation.spec.ts, but require a configured staging test user and are not executed by the default workflow. Visual/live Vercel verification also requires separate acceptance.

## Next roadmap
- Optimized mobile card views for high-volume transaction tables and keyboard shortcut navigation.
- More detailed journal source traceability and document review interactions.
- Secure company/user synced preview preferences, role-aware saved views and bulk action dry-run validation.
