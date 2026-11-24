# Billing platform — CA partners, referrals and commission

Phase 8. Migration `20261105224027_billing_partners.sql`; server functions
`src/lib/billing/partner-program.functions.ts`; UI: Firm → Partner programme (partners),
Settings → Billing → Accountant referral (customers), Superadmin → Platform billing → CA partner
programme (staff).

## Decisions honoured

| Decision                     | Implementation                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D14 attribution model        | Last-touch by default (first-touch selectable); **no window is set**, so nothing is attributed until owners set one         |
| D15 regulatory review        | Payouts are off; enabling them needs a regulatory review reference and a second owner                                       |
| No invented commercial terms | No commission rule, rate, duration, hold period or minimum payout is seeded; values in tests and rehearsals are rolled back |

## Partners

Partners extend `public.platform_partners` (the existing directory) and may link to an existing
practice firm. Firm owners or admins apply from the firm page after accepting the published
`PARTNER_TERMS`; platform staff with `billing.manage` approve, reject or suspend, recording what was
verified (for example the ICAI register entry). Nobody can approve a partnership they belong to.
Partner access is explicit (`billing.partner_users`) or derived from owner/admin membership of the
linked firm. Suspended partners accrue nothing new.

## Referrals

- Partner admins create random 12-character codes (up to 20 active). Links are
  `/pricing?ref=CODE`; the pricing page stores the code in the browser for the billing settings.
- A billing manager links their organisation by entering the code and accepting the published
  `PARTNER_DISCLOSURE`. Each touch records the disclosure acceptance (`billing.legal_acceptances`,
  context `partner`). Partners cannot refer organisations they manage billing for.
- Attribution is per organisation. Last-touch replaces the partner until the first paid invoice;
  first-touch keeps the first. The first paid invoice must fall inside the window after the touch,
  otherwise the attribution ends; once paid, the attribution is locked.
- Codes are random and server-validated, and every link needs the customer's disclosure acceptance,
  so links are not additionally signed.

## Commission rules

`billing.commission_rules`: percentage (basis points) or fixed amount per invoice in one currency,
optional partner, plans, countries, duration in months from the first paid invoice, hold days,
minimum payout and effective dates. A platform owner other than the author approves; approved
rules for the same scope cannot overlap and their terms are frozen (retire and replace). A
partner-specific rule wins over the programme-wide rule.

## Ledger

`billing.commission_ledger` is append-only:

| Entry              | Created by                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `accrual`          | Trigger on each issued invoice: rule amount on the subtotal after discounts, excluding tax |
| `reversal`         | Trigger on each credit note: proportional, and the final credit reverses what remains      |
| `adjustment`       | A platform owner, with an explanation (for example a chargeback reference)                 |
| `payout`           | Payout request (reserves the available balance)                                            |
| `payout_cancelled` | Cancelling a requested or approved payout                                                  |

Percentages round down; fixed amounts never exceed the net invoice amount. Accruals become
available after the rule's hold days. Balances are computed from the ledger per currency.

## Payouts (disabled)

Payouts require all of: the programme flag (changed only by a second owner, with a regulatory
review reference), `PARTNER_PAYOUTS_ENABLED=true` on the server, an approved partner, an available
balance at or above the current rule's minimum in that currency, a request by platform staff who
are not partner members, approval by a different platform owner, and a manual bank transfer
reference to mark it paid. StreakBooks never transfers money automatically.

## Entitlements

The partner programme is a platform programme, not a plan feature customers buy, so it has no
`billing_features` row; access depends on partner approval and the checks above.
