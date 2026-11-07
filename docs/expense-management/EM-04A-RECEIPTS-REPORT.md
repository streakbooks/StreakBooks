# EM-04a — Receipts and claim attachments

**Result:** Partially completed — claim attachment entity, claim detail document panel, and receipt inbox foundation are coded. Inbound email, OCR, mobile capture and offline sync are not claimed live.

## Completed

- Registered `expense_claim` in `ATTACHMENT_ENTITIES` with expenses permission map.
- Updated `can_access_attachment` / `document_entity_exists` for `expense_claim`.
- Claim detail route with secure `DocumentRecordPanel` uploads.
- `expense_receipt_inbox_entries` table + list/register RPCs.
- Receipts & Inbox tab with honest inbound-email-disabled status.
- Unit coverage via attachment registry tests.

## Not claimed

- Receiving or parsing inbound receipt emails.
- OCR extraction.
- Camera capture / offline queue.
- Matching inbox entries to claim lines automatically.
