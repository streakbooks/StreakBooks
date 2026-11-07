# EM-09b — Corporate card disputes and customer rebilling

## Delivered (local)

- Dispute / resolve RPCs for corporate card statement lines (`unmatched|matched` → `disputed` → `unmatched|excluded`)
- Disputing a matched line clears the match and records a claim event
- Claim rebilling fields: `rebilling_status`, `rebilling_invoice_id`
- `prepare_expense_claim_for_rebilling` + `mark_expense_claim_rebilled`
- Settings: rebilling income account (income)
- Corporate Cards tab: Dispute / resolve disputed lines
- Claim detail: create draft sales invoice from billable lines and link it back to the claim
- Client helpers + unit tests for rebilling amount methods and dispute gates

## Migration

`supabase/migrations/20261107144000_expense_management_disputes_rebilling.sql` — committed, **not applied**.

## Not in this slice

- Card provider feed import / chargeback automation
- Exit settlement (EM-09c)
- Partial line rebilling across multiple invoices
- Markup / agreed-rate UI editors (helpers exist; prepare defaults to `actual`)
