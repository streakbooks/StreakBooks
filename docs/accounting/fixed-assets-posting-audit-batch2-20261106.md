# Fixed Assets Posting Audit — Batch 2/6: authenticated evidence endpoints

**Scope:** Accounting-only, read-only backend. No Fixed Assets PR #111 files, postings, schema or UI changed.

## Endpoints added

- `auditAssetDepreciationPosting({companyId, runId})`: verify one positive posted depreciation run. Reads source run, source entries, linked assets, journal and GL lines; checks GL account ownership; calls Batch 1 `reviewAssetDepreciationPosting`.
- `auditAssetDisposalPosting({companyId, assetId})`: verify one disposed asset's disposal source, historical depreciation entry rows and posted journal; checks GL account ownership; calls Batch 1 `reviewAssetDisposalPosting`. **Even a fully matched limited posting result is "partial", not a full disposal approval** because the register lacks proceeds and gain/loss account IDs.

Both endpoints require authenticated access and `accounting.view` **before database reads**. User-requested IDs are validated as UUIDs. Every source/GL table query is scoped by `company_id` and required source/journal ID. The existing `loadCompanyMeta` resolves the company's base currency. No API writes or privileged service role.

## Bounded evidence (fail closed)

| Evidence | Maximum accepted | Why |
| --- | ---: | --- |
| Positive depreciation entries for one run | 200 | Prevent silent partial source-to-GL matching |
| Depreciation history entries for a disposed asset | 500 | Reject incomplete historical accumulated depreciation |
| GL journal lines | 500 | Reject truncated or oversized posted journal |
| Distinct GL accounts | 500 | Verify all referenced accounts belong to the organisation |

Reads use one additional sentinel row and error if exceeded. All limits are within the usual 1,000-row REST cap, so a large result cannot masquerade as an exact match.

For a source with no matching journal, this *posting evidence* API explicitly fails. A zero-depreciation `nothing_left` month without a journal is valid and **not** represented as a posted run; this endpoint is intentionally scoped only to positive posted run IDs.

Any missing/foreign linked assets, missing journal, inconsistent account ownership, reversed journal or changed source metadata yields an explicit error or pure-contract exception. The APIs do **not** independently verify original currency FX valuation, historical register account mappings or GL snapshot consistency. Postings occurring between separate source reads and journal reads may warrant an audit rerun.

## Test implementation

`src/lib/accounting/fixed-asset-posting-evidence.functions.test.ts` contains 13 Vitest server-mock scenarios for both endpoints, source/tenant scoping, permission denied, invalid IDs, source evidence missing, oversized source/GL, account ownership and journal status. Full Vitest execution, integration/E2E, TypeScript, build, staging RLS, production and Vercel verification **not performed** from this GitHub-only session.

User instruction: **Do not run GitHub CI**. No GitHub Actions initiated.

## Next batch 3

Only after review of open Fixed Assets PR #111 and Accounting Exception Centre contracts, wire the bounded fixed-asset evidence source into Accounting's Reconciliation Exception Centre with explicit checked/partial/unavailable coverage and user selection of one run/asset. Do not imply portfolio-wide coverage from one posting, and never turn "partial" disposal verification into a matched/cleared exception.

## Local non-CI test commands

```powershell
cd D:\MyApp\LinkBooks
git status --short
git switch main
git pull --ff-only origin main
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/accounting/fixed-asset-posting-evidence.test.ts src/lib/accounting/fixed-asset-posting-evidence.functions.test.ts
npm.cmd run build
npm.cmd run dev
```
