# EM-10a — Risk indicators, duplicates, category suggest, OCR honesty

## Delivered (local)

- Rule-based duplicate finder (merchant + amount + ±3 day window)
- Claim risk scan (missing receipt/spending request, weekend lines, round amounts, duplicates)
- Category suggestion from prior merchant history
- Receipt inbox OCR columns + `request_expense_receipt_ocr` that marks **unavailable** when no provider is configured (no fake extraction)
- Claim detail risk/duplicate UI; receipts OCR status + Request OCR action

## Migration

`supabase/migrations/20261107146000_expense_management_risk_duplicates.sql` — committed, **not applied**.

## Not in this slice

- Live OCR / vision provider integration
- ML fraud models
- Auto-apply category suggestions into claim drafts
