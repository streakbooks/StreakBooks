# Documents workspace — verified gap analysis and first delivery (2026-11-04)

## Scope and evidence

Reviewed the current `src/routes/_authenticated/files.tsx`, attachment server functions, folder functions, storage path validation, document migrations, existing parity audit and the supplied StreakBooks Files / Xero Documents screenshots. This is a **first implemented slice**, not a claim of full document-management parity.

### Verified current StreakBooks foundation

- Company-wide list, 25-row pages, filename search and entity filter with server-side RLS on attachments.
- Private `company-documents` bucket, size/type validation, signed downloads, attachment links to transaction records, audit events for upload and delete.
- Nested document folders, renaming, moving with database cycle guard and same-company foreign keys.
- Gaps in the reviewed UI: sorting occurred **after** server pagination; unfiled-only query option was not surfaced; there was no selected-file preview and no bulk folder operation.
- Existing `inbox_documents` implementation is not connected to the present Files UI; this work does **not** claim an inbound email address, OCR or automatic accounting entry creation.

### Verified competitor workflows (reference only)

| Product | Confirmed relevant workflow | Important distinction |
| --- | --- | --- |
| Xero | Inbox and Archive, upload/email intake, move into folders, attach to records, preview, rename and bulk file management. | A screenshot of an empty inbox is not evidence of full intake configuration in StreakBooks. |
| QuickBooks Online | Mobile/computer/email receipt capture, extraction, human review and matching/creating expense or bill transactions. | Plan-dependent functionality; accounting review remains necessary. |
| Odoo Documents | Folders, tags, linked records, file requests, email aliases, PDF split/merge and cross-app flows. | Documents/accounting addons include Enterprise functionality; the public `odoo/odoo` repository alone does not expose every proprietary implementation. |

References:
- https://central.xero.com/0/article/Manage-your-file-library
- https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/upload-receipts-bills-quickbooks-online/L862MmZHn_US_en_US
- https://www.odoo.com/documentation/19.0/applications/productivity/documents.html
- https://github.com/odoo/odoo

## Changes in this branch

1. **Deterministic server-side sorting before pagination** by newest, oldest, name or size. Client input is a strict allow-list; IDs provide a stable tie-breaker.
2. **“To file” view** of *unlinked company uploads with no folder* using existing company, entity and `folder_id IS NULL` filters. This is not represented as an operating email inbox.
3. **Short-lived private previews** for matched-safe PDF, PNG/JPEG/GIF/WEBP and text/CSV types. Existing per-attachment RLS remains the permission boundary; HTML/SVG and unsupported formats are download-only; embedded non-image content uses sandboxed frames.
4. **Bulk folder moves** for selected items on the current page, reusing the existing per-file server permission checks and database same-company folder constraints. Partial failure is reported and the list is refreshed.
5. Pure unit tests for the sort allow-list/order mapping and safe preview format selection.

No migrations or production financial records are changed by this branch. Do **not** deploy it as a complete Documents revamp.

## Remaining priorities and acceptance gates

| Priority | Workstream | Current status / gate |
| --- | --- | --- |
| P0 | Complete authenticated browser validation; mobile layout; cross-tenant and restricted-role tests; large-list search/sort; previews on PDFs and legacy inline files | **Not yet verified** |
| P0 | Audit file deletion/storage failure recovery and create a non-destructive retention/recovery policy | **Pending** |
| P1 | Dedicated receiving addresses, verified DNS/inbound provider, webhook authentication, MIME processing, queue retries, malware scans and inbox state | **Not implemented** |
| P1 | OCR and line-item extraction with confidence/provenance, correction UI and duplicate-invoice detection | **Not implemented** |
| P1 | Human-approved draft bill/expense creation with source-document linking, existing posting-engine/period-lock integration and accounting tie-outs | **Not implemented** |
| P2 | Document metadata, tags, smart views, version history, full-text indexing, approvals and audit export | **Not implemented** |
| P2 | Secure client document request/collection workflows, assignment, comments, reminders and supplier statements | **Not implemented** |
| P3 | Multi-company practice work queue, SLA metrics, optional channel integrations and supplier portal imports | **Not implemented** |

## Quality / release checks

- Run `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
- Run authenticated Playwright smoke checks for two unrelated companies and a read-only role (signed preview, bulk move, to-file and sort/pagination).
- Check a folder move against a folder from another company is denied; check a file that is only visible via a linked entity cannot be previewed by a user without that entity's view permission.
- Confirm no effect on general ledger balances and no irreversible data modification.
- Review GitHub Actions status and complete staging UX/security verification before merging or deploying.
