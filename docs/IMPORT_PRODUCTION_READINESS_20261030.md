# StreakBooks — Import Readiness Audit
**Snapshot:** 2026-10-30  
**Release disposition:** **NOT PRODUCTION-CERTIFIED** for all import workflows.

This report is intentionally evidence-based. Code presence, a green typecheck/unit suite, or a CSV template alone is **not** sufficient evidence of a financially correct, tenant-isolated database import.

## Requirement-by-requirement status

| Module / scope | Status | Evidence, limitations, and next acceptance gate |
| --- | --- | --- |
| Sales invoices — CSV drafts & optional AR posting | **PARTIAL** | PR #25 merged. Authenticated real-DB tests must verify draft/approval journal, tax, GL control, period locks, company permissions, retries and concurrent identical imports. |
| Sales — quotes, receipts, credit notes, payments | **NOT IMPLEMENTED** as generic CSV writers | Existing document functions do not establish tested CSV import workflows. Each needs domain-aware validation and posting evidence. |
| Purchases bills — CSV drafts & optional AP posting | **PARTIAL** | PR #27 merged, superseding #26. Verify tax, account classification, supplier-number uniqueness, audit, concurrent retries, AP and GL ties. |
| Purchases — expenses, PO, supplier credits & payments | **NOT IMPLEMENTED** as generic CSV writers | Must use respective domain services; PO is non-posting, credits/payment allocations must reconcile AP. |
| Banking | **PARTIAL** | `src/routes/_authenticated/banking/import.tsx` and `src/lib/banking/import.functions.ts` provide bank-account workflow, mapping/duplicate handling. Requires staging testing of duplicate collisions, account isolation and reconciliation. |
| Contacts | **PARTIAL** | `src/routes/_authenticated/contacts/import.tsx` exists. Test duplicates, account access, matching, names and ownership. |
| Products & Services | **PARTIAL** | Authenticated catalogue importer, PR #19; contextual link PR #30. Explicitly non-inventory; opening stock valuation and COGS are NOT implemented. |
| Projects | **PARTIAL** | Project master CSV importer, PR #21; contextual link PR #30. Verify tenant and customer lookups, code uniqueness, audit. |
| Budgets — existing budget CSV | **PARTIAL** | PR #29 merged: `prepareBudgetImportCsv`, `importBudgetLinesCsv`, explicit merge/replace and atomic `save_budget_lines` RPC. Unit/CI passed. Requires authenticated real-DB tests of overwrite, account permissions and reporting. **Does not post the GL.** |
| Fixed Assets — register CSV | **IN PROGRESS — PR #31 UNMERGED** | Strict depreciation/account parser, atomic idempotent SQL RPC, source tests passed CI; requires new migration and staging test of RLS, replay and concurrent account writes before merge. **Does not post opening GL balances.** |
| Inventory — opening stock / valuation / COGS | **NOT IMPLEMENTED** | Cannot treat the existing non-inventory catalogue as inventory. Needs inventory ledger, valuation rules and posting/reconciliation tests. |
| Accounting — chart / opening balances / journals | **PARTIAL / NOT VERIFIED** | Existing chart import and opening-balances functions must be tested against ledger invariants; generic Import Centre alone is read-only for unsupported types. |
| Payroll employee and opening balances | **NOT IMPLEMENTED** | Needs country/payroll-specific permissions, privacy, obligations and safe imports; employee template alone is not a writer. |
| Tax rate/code imports | **NOT IMPLEMENTED** | Must define jurisdiction, treatment, effective dates, input/output GL mappings and prevent retroactive mutation of posted tax journals. |
| Routing & accessibility | **PARTIAL** | Contextual Sales, Purchases and wider master-data entry points in PRs #28 and #30; Banking and Contacts retain dedicated module importers. Extend true import writers, not validation-only buttons. |

## Financial integrity acceptance criteria — all must pass with evidence

1. Authenticated users with and without the required permission: allow/deny including cross-tenant IDs and RLS.
2. Every financial import: full-file validation **before writes**, strict currency minor units, tax configuration/effective dates, valid accounting periods, duplicate keys.
3. Document domain service: create true draft, authorise through the canonical posting engine, verify exact AR/AP/GL debit and credit totals and fiscal lock behaviour.
4. Retry/concurrency: two simultaneous imports of the same document and mixed case, partial failures and return to consistent state; no duplicate posting.
5. Multiple line CSVs, same supplier references for different suppliers, zero/negative/tax-inclusive and rounding cases as supported by each domain.
6. Reporting tie-outs: trial balance, control accounts, aging, tax reports, inventory valuation/COGS, fixed asset registers, depreciation.
7. Capacity/performance: batch limits, large files, parallel users, database timeouts, audit log completeness, no unbounded client memory.
8. Security: no cross-tenant reads or writes, no public access to untrusted SECURITY DEFINER functions, private attachment storage, no leaked service keys.
9. CI: unit, TypeScript, production build, integration tests and repeatable staging smoke runs. Passing unit/CI alone is not production signoff.
10. Operational: migration reconciliation, backup/rollback plan, monitoring, fault isolation, deployment verification.

## Database / migration inspection (read-only)

On 2026-10-30, source tree contained **73 migration SQL files** and the connected Supabase project reported **76 applied migration entries**. **41 source migration version strings** did not directly match applied entries. This is *version-history drift*, **not proof that those database objects are absent**: read-only catalog checks confirmed `public.budgets`, `public.budget_lines`, `public.fixed_assets`, `public.save_budget_lines(uuid,jsonb,text)` and `public.save_fixed_asset(uuid,uuid,jsonb)` exist. The proposed PR #31 `public.import_fixed_asset_register(uuid,jsonb)` does **not** yet exist.

**Do not run a blind `supabase db push` / replay of all unrecognised migrations on production.** First compare the exact production function/table definitions and migration history, reconcile drift on isolated staging, plan reversibility, then deploy.

## Security and supply chain — not cleared

Supabase security advisors reported 32 `anon_security_definer_function_executable` findings, 6 `function_search_path_mutable` findings, and a leaked-password-protection advisory. At least some anonymous RPCs may be intentionally public (e.g. shared-invoice link and published plan lookup); audit by purpose and role instead of blanket revocation. See Supabase remediations:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

GitHub CI `npm ci` reported **5 dependency vulnerabilities** (1 moderate, 2 high, 2 critical) on a recent run. Must investigate exact advisories, upgrade lockfile safely and retest. These counts are observations, not proof of actual exploitability.

## Release gate and environment

**Do not test financial postings on the live organisation.** Isolated Supabase staging currently requires a separate environment: the Supabase branch creation flow asked for explicit hourly-cost approval (previously quoted USD 0.01344/hour). Do not incur branch charges without the user's specific approval. A self-hosted local Supabase test database with migration reconciliation is an alternative if available. Vercel verification is explicitly excluded until account access is available.

**Decision:** StreakBooks import modules are actively being implemented, but **all-module production readiness is FAIL** until every listed accounting, security, migration and staging test gate has evidence.
