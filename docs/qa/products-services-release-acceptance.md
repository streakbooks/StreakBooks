# Products & Services — Release Acceptance (Batch 10)

> Status on 2026-11-06: **NOT PRODUCTION VERIFIED.** GitHub CI must not be run (user instruction).
> This is an acceptance checklist, not evidence that tests or deployment passed.

## Scope and release criteria
- Batches 1–9: catalogue operations, CSV export/import, bulk pricing, categories, price lists, customer defaults, quantity/date tiers, percentage rules, and atomic document pricing attribution.
- Batch 10: quote conversion must preserve historical source list name and only compatible line snapshots, without repricing or posting to the ledger.
- Production ready **only after** local typecheck, lint, unit/integration/E2E, authenticated staging QA and Vercel runtime checks pass, with results recorded.

## Local Windows PowerShell

```powershell
cd D:\MyApp\StreakBooks
git status --short
git branch --show-current
git fetch origin main
git pull --ff-only origin main
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Before pulling, check for uncommitted changes and confirm the current branch is `main`.
Do not run GitHub Actions or trigger CI. Supabase migrations are already applied to the connected StreakBooks project; do **not** reapply them manually.

## Verification matrix (fill in actual results, never assume)

| Verification | Current status | Required evidence |
| --- | --- | --- |
| GitHub main / PR | Verify after merging Batch 10 | PR, commit SHA |
| GitHub CI | Not run (per instruction) | User directive |
| Typecheck | Not run | Actual exit code and any errors |
| Lint | Not run | Actual exit code and warning/error counts |
| Unit tests | Not run | Passed/failed/skipped counts |
| Integration tests | Not run | Passed/failed/skipped counts |
| E2E / authenticated browser QA | Not run | Test cases, browser and results |
| Build | Not run | Actual exit code and bundle output |
| Supabase migrations | Applied; schema/access checks performed | Migration versions and security queries |
| Vercel deployment | Not verified | Deployment ID, environment, build logs |
| Staging | Not verified | URL + authenticated flows |
| Production | Not verified | Deployment ID + post-deploy smoke result |

## Manual acceptance — perform against test organisations, not real customer data

- [ ] Catalogue: search, sort, filter, choose columns, page, archive/restore, bulk prices, import/export, cross-org permissions.
- [ ] Products: active/inactive, fixed pricing, valid GL accounts, tax-code defaults, non-inventory behaviour and zero prices.
- [ ] Price lists: create/edit/archive, customer defaults, currency matching, quantity tier and date boundary selection, percentage discounts.
- [ ] Exact rounding: integer minor units; currencies with 0, 2 and 3 decimals; fractional quantity thresholds.
- [ ] Preview: changing customer, quantity, document date or list never silently reprices existing lines.
- [ ] Draft save: stored price-list name and line source survive invoice and quote reopen; manual amount/product edits clear stale source.
- [ ] Quote-to-invoice conversion: source quote remains converted, source `quote_id` preserved, invoiced unit amounts unchanged.
- [ ] Quote conversion metadata: header source copied from quote, **only** compatible product/quantity/amount/currency line snapshots copied; old quote pricing date preserved.
- [ ] When converted invoice line differs from quote, metadata is omitted rather than falsely attributed; financial amounts remain unchanged.
- [ ] Quote was already converted: second conversion blocked without a second invoice.
- [ ] Verify authored/paid invoice documents are not repriced and remain immutable; posting and journal flows unchanged.
- [ ] Permissions: users without `sales.draft` cannot convert; anonymous function execution denied; company identifiers cannot cross tenants.
- [ ] Verify source-quote row locking and rollback on failed invoice save; no partial invoice or provenance write.
- [ ] Print invoice/quote: internal pricing provenance does not appear in customer-facing document.
- [ ] Mobile and desktop layouts, loading/error states, navigation, retry paths.

## Database read-only checks

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE name IN ('sales_draft_pricing_provenance',
               'sales_quote_conversion_pricing_provenance',
               'quote_conversion_pricing_source_lock')
ORDER BY version;

SELECT position('FOR UPDATE' IN
  pg_get_functiondef('public.save_sales_document_from_quote_priced(jsonb)'::regprocedure)
) > 0 AS locks_source_quote;

SELECT
  has_function_privilege('authenticated',
    'public.save_sales_document_from_quote_priced(jsonb)', 'EXECUTE') AS authenticated_allowed,
  has_function_privilege('anon',
    'public.save_sales_document_from_quote_priced(jsonb)', 'EXECUTE') AS anonymous_allowed;
```

Expected: all three migrations present, row locking true, authenticated true, anonymous false.
These read-only queries are not substitutes for transaction-level integration tests.

## Release decision

Do not mark this module production-ready until all necessary checks above are executed, failures are fixed, and deployment status is independently verified.
