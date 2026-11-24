# Superadmin benchmark

Fetched 2 November 2026. Prices and capabilities below are only what those pages showed. Cells marked “not verified” were not fetched. Nothing here is copied layout or marketing text for StreakBooks to ship.

## Products

| Product | Official page | What was verified |
| --- | --- | --- |
| Xero | https://www.xero.com/us/pricing-plans/ | US plans Early, Growing, Established. Then-prices shown: $27, $59, $97 per month after an introductory six months. Early limits quotes to 20 invoices and 5 bills. Established lists multi-currency, projects and expenses. Payroll is an add-on (Gusto). Prices exclude tax. |
| QuickBooks Online | https://quickbooks.intuit.com/pricing/ | Simple Start $38, Essentials $85, Plus $140, Advanced $340 per month, with a 50% introductory price for 3 months on that page. Essentials lists 3 users. Advanced lists 25 users. |
| Zoho Books | https://www.zoho.com/us/books/pricing/ | A free organisation tier is listed. Standard shows $15 per organisation per month. Premium shows $60. User add-on shows $3 per user per month, or $2.50 billed annually. Professional and Elite prices were not readable in the fetch, so they are not stated. |
| FreshBooks | https://www.freshbooks.com/pricing | Lite $23, Plus $43, Premium $70 per month after an 80% introductory period. Team members $11 per person per month. Payroll is a separate add-on. |
| Wave | https://www.waveapps.com/pricing | Pro is $19 USD per month or $190 per year, per business. Starter is listed; its price was not clearly stated in the fetch. Bank import uses Plaid and is not guaranteed for every institution. |
| FreeAgent | https://www.freeagent.com/en/pricing/ | Regular $22 per month or $220 per year. Introductory $11 per month or $110 per year for six months. Smart Capture Unlimited add-on $6 per month. The page says data can be downloaded and there is no setup fee. |
| MYOB Business Pro | https://www.myob.com/au/products/myob-business/pro | Pro shows $21 per month during an offer, then $70. Payroll is an extra per employee. The page says there is no lock-in contract. |
| Sage Intacct | https://www.sage.com/en-us/sage-business-cloud/intacct/pricing/ | No public price. Annual subscription, modules assembled per organisation. |
| Odoo | https://www.odoo.com/pricing | One app free. The page shows Standard at US$31.10 and US$38.90 per user per month, and Custom at US$61.00 and US$76.20, with a 12-month discount note. Hosting for Odoo.sh is extra. The page says daily backups are included. |
| NetSuite | https://www.netsuite.com/portal/products/crm/cpq.shtml | Annual licence of core platform, optional modules and users, plus an implementation fee. CPQ is an add-on module. A full module matrix was not fetched. |
| Digits | https://digits.com/pricing/ | Essentials $65, Core $100, Pro $250 per month. Pro marked coming soon on that page. Additional entities can be free under 250 transactions a year, then from $35 per month. |
| Puzzle | https://puzzle.io/pricing | Software still sold. The pricing page shows Core and Complete service figures and a software plan from the marketing page at https://puzzle.io/ (“plans from $30/mo”). An acquisition claim on a Digits comparison page was not treated as Puzzle’s own statement. |
| Stripe Billing | https://docs.stripe.com/billing/entitlements | Entitlements map product features to customers. Webhook `entitlements.active_entitlement_summary.updated` is the provisioning signal. Usage-based prices support per unit, package, volume and graduated tiers, including included quota plus overage. |
| Chargebee | https://www.chargebee.com/docs/billing/2.0/product-catalog/product-catalog | Product families, plans, addons, charges, price points per currency and interval. Entitlements map a feature level onto a catalogue item. Grandfathering exists as an early-access flag and is off by default, so a catalogue edit can affect existing subscriptions unless that flag is set. |
| LaunchDarkly | https://launchdarkly.com/docs/home/releases/percentage-rollouts | Percentage rollouts hash context key and kind into stable buckets. Raising the percentage adds buckets. Kill-switch flags are permanent booleans that serve the off variation without a deploy. |

Sage Accounting, Reckon and Akaunting public workflow sources are reviewed in [the continuation benchmark](benchmark-follow-up-20261102.md), bringing the accounting inventory to 15 products. Their prices are not stated. The old StreakBooks assessment below is historical; current capability evidence is in [RESUMPTION-20261102.md](RESUMPTION-20261102.md).

## What StreakBooks should copy in behaviour, not in presentation

- A plan plus separately priced add-ons (Xero payroll, Zoho users, FreshBooks team members, Stripe prices).
- Versioned prices and an explicit grandfathering switch (Chargebee’s default is the opposite of StreakBooks: StreakBooks keeps the subscriber’s price version).
- Stable percentage buckets and a kill switch that does not need a deploy (LaunchDarkly).
- Entitlement changes driven by the billing record, with the application reading one decision (Stripe).
- Quote-only enterprise plans where a public price would be misleading (Sage Intacct, NetSuite).

## StreakBooks assessment

| Area | Assessment |
| --- | --- |
| Ledger | Present and shared across plans. Limits are seats, documents and modules, not a weaker ledger. |
| Public price book | Versioned plan prices exist. Per-feature prices are specified and stored by the new migration, which is not applied. |
| Add-ons | `billing_addons` exists. Customer self-serve checkout of those add-ons is not complete. |
| Entitlements | Plan limits exist. Override resolution is implemented in the repo and not applied. |
| Partner / firm admin | Firm membership and client links exist. A firm link does not grant every client record. |
| Usage billing | Counters exist for a few metrics. Overage invoicing is not wired to a provider. |
| Revenue analytics | Current MRR/ARR only. No cohort store. |
| Kill switch and approvals | Specified, tested in TypeScript, enforced in SQL once migrated. |
| Provider sync | BLOCKED. Test-mode keys were not used. |

## Gap register

| Gap | Class | Priority |
| --- | --- | --- |
| Apply entitlement migration and verify grants on one business | Functional | Essential |
| Per-feature price rows and a customer quote that reads `list_live_feature_prices` | Billing | Essential |
| Test-mode provider price and subscription item sync | Billing | Essential, BLOCKED on credentials |
| Separate empty, zero and forbidden metrics everywhere, not only revenue | Functional | High |
| Historical MRR movements stored at change time | Billing | High |
| Percentage rollout enforced in `winning_entitlements`, not only in TypeScript | Architectural | High |
| Hash chain applied and checked | Security | High |
| Support access expiry already exists; extend the same pattern rather than impersonation | Security | High |
| Integration health that is measured, not inferred from env vars | Architectural | Advanced |
| Status page, SMS, e-signature, BI warehouse | Functional | Future, integrate |
| Public price for a NetSuite-class enterprise plan | Billing | Not applicable until StreakBooks sells that motion |

## Risks

- Chargebee-style edits that change existing subscribers without a grandfather flag. StreakBooks must keep the current version unless a noticed migration runs.
- Treating a fetched introductory price as the ongoing price. Xero, QuickBooks, FreshBooks, FreeAgent and MYOB all show a lower first period.
- Building a status page or help desk with no vendor account.
- Platform staff gaining ledger access in order to debug billing.

## Roadmap class

Essential: entitlement resolution in the database, price book, approvals, revenue-state honesty. High: usage overage, historical MRR, provider test sync, rollout enforcement. Advanced: customer 360, integrity monitor, firm wholesale billing. Future: commodity status, chat, BI and e-signature integrations. Not applicable: copying a vendor’s visual design or claiming their unpublished admin console.
