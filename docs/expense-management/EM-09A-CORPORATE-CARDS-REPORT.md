# EM-09a — Corporate card register and statement matching

## Delivered (local)

- `expense_corporate_cards` register (label, last4, network, holder, liability account)
- `expense_corporate_card_transactions` statement lines with unmatched/matched status
- Link claims (`payment_source = corporate_card`) to a card
- Match transaction ↔ claim when totals/currency/card align
- `post_expense_claim` accrues corporate-card claims as DR expense / CR card liability
- Corporate Cards tab + My Expenses payment source option

## Migration

`supabase/migrations/20261107143000_expense_management_corporate_cards.sql` — committed, **not applied**.

## Not in this slice

- Feed import from card providers
- Disputes workflow / rebilling / exit settlement
- Partial amount matching across multiple claims
