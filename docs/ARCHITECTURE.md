# LinkBooks architecture and engineering baseline
**Audited checkpoint:** main `ef53489f3118a55d66a7252454ee8d7e340ac335` · 3 November 2026

## Verification boundary
This is a repository-wide **file inventory and targeted source/configuration audit** plus read-only Supabase metadata; it is not a line-by-line code review of 1,554 tracked files or an authenticated production certification. Avoid treating a table, feature flag, or route's existence as proof a workflow is correct.

## Stack and delivery
- **UI:** React + TypeScript, TanStack Router/Start, Vite, Tailwind CSS, Radix UI primitives, TanStack Query, Zod validation, Lucide icons, Recharts.
- **Server:** TanStack server functions and middleware; server-side Supabase clients scoped to signed-in sessions; Nitro/Vercel build configuration in `vite.config.ts`.
- **Persistence:** Supabase Auth + PostgreSQL; RLS, SQL functions, migrations and company-scoped data. No separate ORM is assumed.
- **Exports:** PDF, XLSX and CSV reporting pipeline; standard financial statements have authorized server capture, whereas many screen exports cover only loaded rows.
- **Operations:** GitHub Actions, npm lockfile, Vercel, Lovable synchronization. The `AGENTS.md` file explicitly prohibits rewriting published history.
- **No new production dependencies** were added in the baseline hardening milestone.

## Repository inventory
| Item | Observed size | Primary location |
|---|---:|---|
| Tracked file entries | 1,554 | Git tree of main |
| Application routes | 130 | `src/routes/` |
| Libraries and tests | 658 | `src/lib/` |
| UI components | 241 | `src/components/` |
| Repository SQL migration files | 186 | `supabase/migrations/` |
| Browser test files | 69 | `e2e/` |
| Documentation files | 183 | `docs/` |
| CI workflows | 1 | `.github/workflows/quality.yml` |
| Public database tables (read-only metadata) | 211 | Connected LinkBooks Supabase project |
| Applied migration records (read-only metadata) | 212 | Connected LinkBooks Supabase project |

Repository migration file count and database migration record count are **not directly comparable**; reconcile chronological IDs, history and drift before generating or applying new schema changes.

## App composition
- `src/routes/_authenticated/`: company-scoped screens (accounting, sales, purchases, banking, contacts, fixed assets, budgets, projects, reporting, practice/firm, imports, tax and settings).
- `src/components/reports/` and `src/lib/reports/`: catalogue runners, standard statements, report builder, saved views, packs, schedules, exports and a universal presentation explorer.
- `src/lib/accounting/`: posting conventions, ledger capture, periods, FX, revaluation, reporting and integrity helpers.
- `src/lib/sales/`, `src/lib/purchases/`, `src/lib/banking/`, `src/lib/tax/`: document lifecycles, allocations, bank matching, rates, returns and associated workflows.
- `src/lib/platform/`, `src/lib/portals/`, `src/lib/billing/`: operations, customer access, notifications, and subscriptions.
- `src/integrations/supabase/`: generated client/database typings and auth middleware. Do not manually edit generated clients without understanding regeneration.

## Core data model (selected tables, not exhaustive)
| Domain | Example tables / relationships |
|---|---|
| Tenant and access | `companies`, `company_members`, `role_permissions`, `firms`, `firm_client_links` |
| General ledger | `accounts`, `accounting_periods`, `journals`, `journal_lines`, `audit_events` |
| Receivables | `contacts`, `sales_invoices`, `sales_invoice_lines`, `sales_credit_notes`, `sales_receipt_allocations` |
| Payables | `purchase_bills`, `supplier_payments`, `purchase_credit_allocations`, `purchase_orders` |
| Banking | `bank_accounts`, `bank_transactions`, `bank_statement_imports`, `reconciliation_links`, `bank_rules` |
| Local tax | `company_tax_settings`, `tax_rates`, `tax_codes`, `tax_returns`, `tax_return_lines` |
| FX / dimensions | `company_currencies`, `exchange_rates`, `fx_revaluation_runs`, `tracking_categories`, `line_tracking_assignments` |
| Assets / plans | `fixed_assets`, `asset_depreciation_runs`, `budgets`, `budget_lines` |
| Reporting / practice | `report_saved_views`, `report_packs`, `report_schedules`, `report_deliveries`, `practice_tasks` |

## Trust boundaries and financial invariants
1. Route authentication is a UI gate, **not an authorization guarantee**. Server functions use `requireSupabaseAuth` and per-company checks; database RLS is a second boundary. Confirm both for every new operation.
2. Every posting must be scoped to one permitted company, use valid chart accounts and obey periods/locks, debit-credit equality, immutable posted history and audited reversals.
3. Amounts are currency-minor-unit values; display and conversion must respect currency decimals and rate date. Never use JS floats for accounting integrity decisions.
4. Regional tax returns must reconcile to document tax lines, tax-control journals, amendments/credits and dated payment events; **no filing/compliance certification is implied by a screen**.
5. Report filters may not silently change original opening/closing balances or recalculate source totals after client-side presentation filtering.

## CI and evidence
`.github/workflows/quality.yml` runs Node 22 `npm ci`, TypeScript, changed-file ESLint, Vitest, isolated PostgreSQL workflow tests, cash history/delivery checks, native navigation checks, browser test discovery and production build. Its authenticated staging job is conditional and was not evidenced as executed for this baseline. Previous reporting release passed 1,809 unit tests; this number is a historical checkpoint, not proof for future commits.

## Current high-risk review areas
- Review SECURITY DEFINER routines exposed to `authenticated` and the three explicitly anonymous-callable routines **individually**, not by blanket revocation. Some implement intentional public invoice sharing or price discovery.
- Database security advisors report 6 RLS-enabled tables without explicit policies (including private worker tables). This can be deliberately deny-all; establish intended access and grants first.
- The tracked `.env` contained project identifiers, URLs and publishable keys only in this inspection, but repository hygiene must prevent committing environment files and generated builds.
- Reconcile database migration history before any schema change; verify application roles, control accounts, signed-in financial results and tenant isolation in staging.

## Local setup
Use Node 22 and npm, configured Supabase publishable credentials, then `npm ci` and `npm run dev`. See [README](../README.md), [REVIEW_GUIDE](REVIEW_GUIDE.md) and [ROADMAP](ROADMAP.md). Do not use production data as test fixtures.

