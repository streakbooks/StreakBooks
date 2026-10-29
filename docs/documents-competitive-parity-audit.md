# LinkBooks — Documents competitive parity and differentiation audit

Status: REQUIREMENTS / NOT IMPLEMENTATION EVIDENCE. Owner-approved scope. No feature may be marked complete based on UI presence alone.

## Benchmarks (reviewed 2026-10-29)
- Xero/Hubdoc: email-in, extraction, publish transaction with attachment, folder/tag organisation. https://central.xero.com/0/article/Hubdoc-in-Xero
- QuickBooks Online: custom receipt/bill forwarding email and extraction/matching. https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-payable/email-receipts-bills-quickbooks-online/L7r2LAQ7C_US_en_US
- Zoho Books: document inbox, folder-level permissions, autoscan, transaction conversion. https://www.zoho.com/ca/books/help/documents/documents.html
- Dext: supplier portal fetch, unique email, WhatsApp/mobile intake, supplier rules, statement matching, approvals, extraction, auto-publish, vault. https://help.dext.com/en/articles/416727-getting-started-with-dext-for-accountants-and-bookkeepers

Do not copy any competitor UI, terminology beyond standard accounting terms, or proprietary code.

## Acceptance gates

### P0 — Complete and stabilise existing Files
- Root folders, nested folders, breadcrumbs, rename, move, cycle protection, delete-only-when-empty, same-company RLS.
- Upload directly to current folder, including drag/drop and multiple files; preserve links to invoice/bill/contact/journal.
- All Files includes every folder; Unfiled filters folder_id IS NULL; folder view filters selected folder; clear semantics for descendants.
- PDF/image/text safe preview, download, allowed file validation, 20 MB limit, useful progress/error messages.
- Search/filter/sort/pagination accurate across whole result set (not just one page).
- Bulk move/download/delete, keyboard accessibility, mobile layout, empty states.
- Tests: permissions, tenant isolation, uploads, nested folder, refresh persistence, legacy files, storage errors.

### P1 — Document inbox + dedicated address per eligible organisation
- Stable non-guessable unique receiving address, lifecycle status, revoke/rotate with controlled grace period, subscription state.
- Real verified inbound provider/domain/DNS and signed webhook; no pretend working email.
- Safe MIME parsing, attachment extraction, private storage, sender metadata, idempotency, retry/dead-letter queue, virus/malware scanning, abuse limits, quotas, retention and privacy controls.
- Inbox states: received, processing, needs review, ready, approved, archived, failed.
- Admin-facing provider setup health, delivery diagnostics and manual retry.
- Test with actual inbound message and forwarded message; wrong-org rejection and duplicate delivery.

### P1 — Document-to-accounting pipeline
- OCR / text extraction, line items, supplier, invoice number, date, due date, tax, currency, total, confidence and provenance.
- Supplier matching and rules; duplicate invoice detection; side-by-side original and extracted values.
- Review/edit and create nonposting draft bill; authorisation uses existing immutable posting engine, period locks and permissions.
- Document remains linked through bill, payment and bank reconciliation.
- Human approval by default. No automatic posting without explicit policy and tests.
- Tests: multi-tax, discounts, FX, partial payments, duplicates, reversals, rounding, invalid totals, RLS.

### P2 — Competitive differentiation
- Smart folders, labels/tags, saved views, full-text search, version history, bulk operations.
- Document requests, client portal, delegated uploads, accountant queue, notifications and comments.
- Supplier statement reconciliation against AP and received invoices; missing-bill detection.
- Optional supplier-portal collection, mobile capture and supported communication-channel intake.
- AI coding suggestions with transparent confidence, rule precedence and review history.
- Multi-organisation practice dashboard, processing SLA metrics, queue analytics and exportable audit trail.

## Delivery process
1. Produce original visual preview and get owner approval for material UX changes.
2. Implement in small reviewable PRs; additive migrations with rollback/backup plans.
3. Unit, integration, e2e, security and accounting-integrity tests.
4. Run typecheck, lint, tests, build, browser workflows and real inbound-provider smoke test.
5. Requirement-by-requirement PASS / FAIL / NOT IMPLEMENTED / BLOCKED report with evidence.
6. Do not merge or deploy if CI fails or provider/DNS configuration is incomplete; disclose blockers.

## Current evidence snapshot
- Existing folder UI/server functions and cycle guard present on main.
- Branch feature/documents-folder-upload-fix carries folder_id upload registration correction; live behaviour not yet confirmed.
- Dedicated email, OCR, statement reconciliation and automation not yet implemented.
