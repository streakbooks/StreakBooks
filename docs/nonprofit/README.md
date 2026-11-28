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

This module is **not production ready**. The hosted schema through disbursement approval is present on project `qugoaaizclvkzesptovm`. The historical fund statement in `20261128250000` is local only: it has not been applied to the hosted project because this repository still has no restore point for that project. Vercel production and an authenticated organisation workflow have not been verified. No live donation or disbursement rows were created. Public donation pages, live card charging, statutory filing, PDF and spreadsheet exports, full volunteer, member and grantor portals and recurring card runs are still outstanding.

The screen can now post depreciation, payroll accrual and payment, investment income, inventory distribution, exchange gain or loss, pledge impairment and a functional-class allocation. An eligible beneficiary disbursement can be requested and approved. While segregation is on, the requester cannot approve it. Fund reports can show opening net assets, support, expenses, transfers, releases and closing net assets for a selected period. The report says it is not a government filing. Each journal still uses `post_journal`.

Migrations:

- `supabase/migrations/20261128220000_nonprofit_fund_accounting.sql`
- `supabase/migrations/20261128221000_nonprofit_operations.sql`
- `supabase/migrations/20261128233000_nonprofit_posting_depth.sql`
- `supabase/migrations/20261128240000_nonprofit_disbursements.sql`
- `supabase/migrations/20261128250000_nonprofit_fund_statements.sql`

Local proof: `npm run test:nonprofit:postgres` on disposable PostgreSQL 17. That command does not touch a hosted database.
