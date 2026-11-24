# StreakBooks pricing strategy

Reviewed 30 October 2026. List prices are stored in the database and can be changed by platform staff. This note records why the seed was chosen. It is not a price lock.

## Confirmed competitor prices

- Xero US (https://www.xero.com/us/pricing-plans/, 30 Oct 2026): Early $27, Growing $59, Established $97. A promo cuts those to $2.70, $5.90 and $9.70 for six months. Early includes 20 invoices and 5 bills. US billing is monthly. Tax is extra.
- Xero UK (https://www.xero.com/uk/pricing-plans/, 30 Oct 2026, excluding VAT): Ignite £18, Grow £39, Comprehensive £55, Ultimate £70. Monthly only.
- Xero Australia (https://www.xero.com/au/pricing-plans/, 30 Oct 2026, including GST): Comprehensive usually $107. Monthly only.
- QuickBooks Online US (https://quickbooks.intuit.com/pricing/, 30 Oct 2026): Simple Start $38, Essentials $85, Plus $140, Advanced $340, with a three-month half-price promo.
- Zoho Books US (https://www.zoho.com/us/books/pricing/, 30 Oct 2026): Free, Standard shown as $15 a year in the fetched page, Premium $60. Invoice caps are yearly. Professional, Elite and Ultimate dollar amounts were not in that page.
- FreshBooks (https://www.freshbooks.com/pricing, 30 Oct 2026): Lite $23, Plus $43, Premium $70, with an introductory discount. 30-day trial, no card.
- Wave (https://www.waveapps.com/pricing, 30 Oct 2026): Starter $0, Pro $19 a month or $190 a year.
- Akaunting (https://akaunting.com/pricing, 30 Oct 2026): yearly prices shown as $8, $24, $56 and $145 a month. Standard does not include double-entry. StreakBooks keeps double-entry on every paid plan.
- Sage US (https://www.sage.com/en-us/sage-business-cloud/accounting/pricing/, 30 Oct 2026): no public list price.
- Xero New Zealand and Zoho India were not fetched. Do not treat a figure for those pages as confirmed.

## Seed

Starter $12, Growth $30, Pro $60, Practice $99 a month in USD. Yearly is ten times monthly. Non-USD amounts in the migration are a rounding draft with `needs_review` set. Promos are coupons with a duration. They do not change the list price. The trial is 14 days of Growth and does not require a card unless that setting is changed. Existing trials are not shortened.

## Cost flags

Card fees are cited from https://stripe.com/pricing as 2.9% plus $0.30. AI, storage and bank-feed unit costs in `billing_cost_inputs` stay `needs_review` until the owner confirms them. The margin helper flags a plan below 70% at typical usage or 40% at the maximum quantity.

## Tax

Stripe Billing is the subscription system for card payments in test mode. Razorpay remains available for INR when a test key is present. Tax collection is not implemented. An accountant needs to confirm that before any tax feature is switched on.

## What stays partial

Live bank-feed metering, voice minutes and an API gateway have limits in the catalog. There is no product call site for those three, so the limit is stored and not enforced in a request path. Email notices use Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, and otherwise return not configured. Payment-failure emails do not yet have a billing recipient, so they report `no_recipient`.
