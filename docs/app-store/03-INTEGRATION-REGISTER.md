# LinkBooks Integration Register

**Rule:** Report completed integrations separately from planned.  
**Install rule:** Never offer Install / Connected unless status is **Available** and E2E verified.

## Status vocabulary

Research · Provider Approval Required · Planned · In Development · Testing · Available · Unsupported

## Category groups covered

Invoicing and Job Management · Payroll and HR · Payments and Banking · Time Tracking · Inventory and Manufacturing · Reporting, Budgets and Forecasting · CRM and Marketing · Bills, Expenses and Approvals · E-commerce and Point of Sale · Accountant Tools and Practice Management · Documents and AI Automation · Tax and Compliance · Data Migration · Workflow Automation

## Completed (verified Available)

| Code | Name | Notes |
|---|---|---|
| csv_sales_import | CSV Sales Import | Data Import Centre |
| csv_purchases_import | CSV Purchases Import | Data Import Centre |
| csv_contacts_products_import | CSV Contacts & Products | Data Import Centre |
| bank_csv_import | Bank Statement CSV | Banking import |
| xero_migration | Xero Migration (CSV) | Not live OAuth |
| quickbooks_migration | QuickBooks Migration (CSV) | Not live OAuth |

**Live third-party / native API connectors completed: 0**

## Planned / in progress (not installable)

See in-app **App Store → Integration Register** (`/app-store/register`) for the live list generated from `buildIntegrationRegister()` — includes Shopify, Amazon, Stripe (merchant), WooCommerce, PayPal, Square, Hubdoc, Link My Books, Dext, HubSpot, Guesty, Hostaway, Salesforce, etc.

## Infrastructure delivered (not a connector completion)

- Connector adapter interface + Shopify/Amazon/Stripe scaffolds (`installEligible: false`)
- Sync jobs, events, mappings, webhook subscriptions/deliveries (SQL)
- Idempotency, webhook security, OAuth token vault contracts
- Fail-closed sync enqueue decision helper (`engine/enqueue.ts`) — does not write fabricated jobs
- Public API v1 catalogue **HTTP-mounted** at `/api/marketplace/v1` (routes catalogue open; data routes `security_locked` until vault + review + consent). Billing SaaS API remains at `/api/v1`
- Customer screens: exceptions, billing honesty, ratings (zero fabricated), install wizard (activate locked), platform admin
- Developer portal sections: publisher, applications, register, webhooks, sandbox, versions, analytics, usage, partner, support (vault-locked credentials)
- Partner tiers, trust/certification, analytics event tables

## Non-claims

- No universal compatibility
- No invented partnerships
- Platform Stripe billing ≠ merchant Stripe App Store connector
