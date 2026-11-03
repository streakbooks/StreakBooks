# LinkBooks

LinkBooks is a multi-company cloud accounting and practice-management application with a posted double-entry ledger, sales/purchase documents, banking, budgets, fixed assets, tax configuration and financial reports.

**Status:** Active development. Country-specific US sales-tax, UK VAT/MTD, Australian GST/BAS and New Zealand GST requirements must be separately tested and certified before customer-facing filing claims. See [architecture](docs/ARCHITECTURE.md), [gaps](docs/GAP_ANALYSIS.md), [roadmap](docs/ROADMAP.md), [clean-room design](docs/CLEAN_ROOM.md) and [review guide](docs/REVIEW_GUIDE.md).

## Stack
TypeScript, React, TanStack Start/Router/Query, Vite, Tailwind, Supabase Auth/PostgreSQL/RLS, GitHub Actions, and a Nitro/Vercel build. This repo also syncs with Lovable; **never force-push or rewrite published history**.

## Requirements
- Node.js **22**, npm, Git
- An authorized Supabase project and its *publishable* configuration
- Windows PowerShell or a POSIX shell for local development

## Install and run
```powershell
git clone https://github.com/linkbusinessadvisory/LinkBooks.git
cd LinkBooks
Copy-Item .env.example .env
# Edit .env locally, set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
# SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to your authorized project.
npm ci
npm run dev
```
Open http://localhost:8080. On macOS/Linux replace `Copy-Item .env.example .env` with `cp .env.example .env`. **Do not commit .env**; it is ignored. Never place service-role or other secret keys under a `VITE_` prefix.

If upgrading an older checkout, **back up the original tracked `.env` outside this repo before pulling**. This milestone removes that file from Git tracking. Refer to [REVIEW_GUIDE](docs/REVIEW_GUIDE.md) for safe PowerShell commands. Cloud deployments require environment variables configured in the hosting provider.

## Quality checks
```bash
npm ci
npm run check:repository
npm run typecheck
npm test
npm run lint
npm run build
```
The GitHub `quality.yml` workflow additionally runs PostgreSQL workflow checks, navigation validation and browser test discovery. Real authenticated staging tests run only when explicitly configured.

## Development rules
- Keep every financial transaction balanced; validate period locks, currency precision and company membership on the backend and in PostgreSQL.
- Use additive/data-preserving migrations; do not run production migrations without an approved verification/rollback plan.
- Write original designs. Public feature concepts may inform requirements; Odoo and Xero source, CSS, layouts, assets and proprietary copy must not be reused.
- Dependencies newly added must be permissively licensed and recorded in [THIRD_PARTY](docs/THIRD_PARTY.md).
- No actual client data, account credentials, .env files or generated build folders in commits.
- Keep changes small, linted, typed, tested and reviewed. Never force-push or rewrite published history.

## Ledger health and financial close
Open **Accounting → Ledger health** (or `/accounting?tab=health`) to run eight read-only ledger integrity checks for the selected company. The panel explicitly reports failures and unavailable checks; it is not independent financial certification. Use **Accounting → Period close** for accounting-year close evidence and optional year-end journals. See [REVIEW_GUIDE](docs/REVIEW_GUIDE.md) for safe manual acceptance steps.

## Reports
Reports → All reports includes P&L, Balance Sheet, Trial Balance, cash flow, account transactions, aged receivables/payables, tax, budget-v-actual and other analysis. Use **Customize view** for loaded-row columns, filtering, sorting and grouping; the original financial report remains the accounting authority. Loaded-row export is not necessarily full-account history.

