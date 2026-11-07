# EM-04b — Receipt upload, match and offline drafts

**Result:** Partially completed — coded and unit-tested locally. Migrations not applied; browser/email/OCR not verified live.

## Completed

- `expense_receipt_inbox` attachment entity with RLS map updates.
- Real file upload on Receipts & Inbox (private `company-documents` bucket + finalize RPC).
- Match inbox entry → claim RPC, then client copies the file onto the claim attachment entity.
- Dismiss open inbox entries.
- Camera/mobile capture file input (`capture="environment"`) — device-dependent.
- Offline claim draft queue (`localStorage` + memory fallback) with sync from My Expenses.
- Honest copy: inbound email and OCR remain not configured.

## Not claimed

- Inbound email provider / mailbox routing.
- OCR extraction or auto-categorisation (EM-10).
- Applied database migrations on a live project.
- Browser E2E / GitHub push / CI / deployment.
