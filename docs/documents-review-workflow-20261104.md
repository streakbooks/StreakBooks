# StreakBooks Documents: manual capture review and approvals

## Delivery boundary

This change extends the **real company-attachment repository**, rather than reviving a disconnected metadata-only inbox. New company uploads and existing company files are enrolled into a persisted review queue when migration `20261104054143_documents_review_workflow.sql` is applied.

The work does not create bills, post ledger entries, modify bank reconciliation, imply that malware scanning or OCR is running, or claim an email receiving address exists.

## Functionality

- Review queue accessible from **Files → Document review**, with status filters and real pagination.
- Private preview/download using the existing restricted company storage access functions.
- Editable document classification, supplier/customer name, reference, document date, currency, amount in minor units, and internal notes.
- Document-only review statuses: needs review, ready for approval, approved, rejected, archived.
- Approval requires `sales.authorise` or `purchases.authorise` in the database, not just the UI.
- Updates require the source attachment's manage permission, optimistic `version` matching, and company-scoped attachment references. Read-only members can see permitted documents but cannot update.
- Immutable, append-only event history recorded by trigger; direct user writes and deletes are disallowed.
- Backfill of existing organisation uploads, without processing or changing their file contents.
- All accounting source records, permissions and posting rules remain unchanged.

## Validation before accepting merge

1. GitHub CI: TypeScript, changed-file ESLint, Vitest, isolated PostgreSQL accounting checks, navigation and production build.
2. With migration applied in a controlled environment: verify RLS for two companies, direct Data API attempts to approve without `*.authorise`, immutable status history and stale-version update rejection.
3. Authenticated browser staging: upload, view queue, edit, ready, approver sign-off, restricted role, download and archival. Confirm accounting ledger unchanged.
4. Supabase security advisor. If migration is not applied, UI must show a clear error rather than synthetic results.

## Not yet delivered: external dependencies and advanced work

- Actual inbound email service and dedicated per-company email address (DNS, provider and signed webhook required).
- OCR / AI line-item extraction, confidence provenance, multi-page invoices and explicit correction workflows (provider/model selection and document processing jobs required).
- Malware scanning before processing or handing files to external providers.
- Rule-driven automated classification, duplicate invoice detection and AP matching.
- Posting into accounting, multi-level accounting approval, supplier statement reconciliation, version recovery, client document requests, sophisticated tags/full-text search and the practice-wide SLA dashboard.

Those items are **pending**, not reported as implemented. They must use the authoritative accounting engine and database isolation policies with real integration tests. For production deployment, apply and validate the migration deliberately rather than treating a GitHub merge as a database rollout.
