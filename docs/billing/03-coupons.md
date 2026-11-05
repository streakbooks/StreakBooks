# Billing platform — coupons

Phase 7. Migration `20261105223023_billing_coupons.sql`; admin `src/components/platform/billing/CouponsAdmin.tsx`
(Superadmin → Platform billing → Promo codes); checkout in `billing.functions.ts`.

Coupons extend the existing `billing_offers` table. No code or discount value is seeded; the
existing `WELCOME20` row (inactive) is unchanged.

## Rules

| Rule                                                                    | Field                                                    | Default                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| Percentage (up to the existing 50% cap) or fixed amount in one currency | `kind`, `percent_bps`, `amount_minor`, `amount_currency` | —                                     |
| First period, a number of months (1–36), or every period                | `duration_type`, `duration_months`                       | First period                          |
| Plans and billing periods                                               | `plan_codes`, `intervals`                                | All                                   |
| Countries (organisation country)                                        | `countries`                                              | All                                   |
| Validity dates                                                          | `starts_on`, `ends_on`                                   | Open                                  |
| Total uses                                                              | `max_redemptions`                                        | Unlimited                             |
| Uses per billing account                                                | `per_account_limit`                                      | 1                                     |
| Minimum purchase in a currency                                          | `min_purchase_minor`, `min_purchase_currency`            | None                                  |
| Stacking                                                                | `stackable`                                              | Off (one code per checkout; enforced) |

A code's discount terms cannot change once it has been reserved, redeemed or linked to a provider;
dates, limits and the active flag can. Discounts are computed in the database, rounded down for
percentages, capped at the price (never below zero), and tax is recomputed on the discounted amount.

## Lifecycle

1. **Quote** — `billing_quote_coupon` checks every rule and returns the discount, tax and total.
2. **Reserve** — at checkout `billing_attach_coupon` reserves the code on the customer's own open
   checkout (the code row is locked, so limits hold under concurrency). Reservations count towards
   limits for 24 hours, so an abandoned checkout frees its slot.
3. **Provider** — Stripe: a coupon created once per code and currency and applied to Checkout.
   Razorpay: offers can only be created in the Razorpay Dashboard; platform staff link the offer id
   (test and live separately). Without a link the code is refused for Razorpay payments.
4. **Redeem** — the verified checkout event redeems the reservation once and increments the count;
   audited in the billing audit chain.
5. **Invoice** — the payment and invoice record the discount Stripe reports and the code.
   Razorpay does not report the discount, so its invoices show the amount charged.

Legacy kinds (extra trial days, extra free months, price lock) keep working for earlier plans and
are refused for Standard, Pro and Business.
