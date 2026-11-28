# Nonprofit Management

Nonprofit Management is an optional StreakBooks module. It stays off until an organisation maps ledger accounts and activates it. Ordinary accounting customers are unchanged.

The module posts only through the existing `post_journal` function. Fund identity is stored in `nonprofit_fund_tags` after the journal is posted. The chart of accounts is not copied.

## Recognition rules

Unconditional cash, including donor-restricted cash, credits contribution revenue. It is not recorded as a liability merely because the fund is restricted. Conditional cash and conditional grant advances credit a refundable advance. Revenue is recognised only when the conditions are satisfied, and the person who marked the conditions met cannot recognise the revenue while segregation is on.

Conditional pledges and donated services do not create journals. An unconditional pledge debits contributions receivable. Collecting it does not recognise the revenue again.

## What this build does

Funds, donors, donations, receipts, pledges, grants, functional expenses, interfund transfers, restriction releases, campaigns, programmes, volunteers, members, beneficiaries, board records, compliance reminders and donor-portal grants.

Receipt wording states that the document is not a government filing. Country packs are reminders. Payment gateways are not live: card numbers are not stored, and `gateway_configured` stays false until an organisation connects a gateway.

## What is not production ready

This module is **not production ready**. Hosted Supabase and Vercel production have not been verified for these migrations. Public donation pages, live card charging, statutory filing, PDF and spreadsheet exports, full volunteer, member and grantor portals, disbursement approval, recurring card runs and historical statement packs are still outstanding.

The screen can now post depreciation, payroll accrual and payment, investment income, inventory distribution, exchange gain or loss, pledge impairment and a functional-class allocation. Each of those still uses `post_journal`.

Migrations:

- `supabase/migrations/20261128220000_nonprofit_fund_accounting.sql`
- `supabase/migrations/20261128221000_nonprofit_operations.sql`
- `supabase/migrations/20261128233000_nonprofit_posting_depth.sql`

Local proof: `npm run test:nonprofit:postgres` on disposable PostgreSQL 17. That command does not touch a hosted database.
