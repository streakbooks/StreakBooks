# Fixed Assets posting and reconciliation: Accounting Batch 1 audit

Date: 2026-11-06. Repository: linkbusinessadvisory/LinkBooks.
Status: Source audit and pure regression contracts committed; no local repository test, live database test, GitHub Actions or deployment run.

## Existing implementation reviewed
- Main: supabase/migrations/20261025400300_fixed_assets.sql, src/lib/fixed-assets/depreciation.ts, src/lib/fixed-assets/fixed-assets.functions.ts and Accounting's existing generic posted GL evidence.
- Open and unmerged PR #111: feature/fixed-assets-register-safety-ux-20261106. The PR already introduces the Fixed Assets register-vs-GL account-level reconciliation, journal navigation, CSV review and register workflows. Do not duplicate its reconciler or change its files in a competing PR.
- PR #111 calculates net posted base-currency GL account balance minus the current register's cost minus accumulated depreciation for accounts referenced by registered assets. It pages records and fails closed on unsafe source numbers. This remains unverified until actual full testing and PR merge.
- PR #111 explicitly does NOT cover unrelated/unregistered acquisition accounts, immutable historical account mappings, tax depreciation or a transactional snapshot between register and ledger reads. A matching control balance does not verify individual asset or journal postings.

## Ground-truth source journal rules observed in SQL
1. Monthly depreciation: when positive depreciation exists, SQL post_journal emits source_type='depreciation', source_id=asset_depreciation_runs.id, idempotency_key='fa-dep-run:' + run ID and journal_date=period_end. Source entry totals equal run.total_minor; positive entry count equals run.asset_count; each asset posts expense debit and accumulated depreciation credit. A month with no positive amount legitimately has no journal. Check period locks and concurrency separately.
2. Asset disposal: SQL post_journal emits source_type='asset_disposal', source_id=asset ID, idempotency_key='fa-dispose:' + asset ID and journal_date=disposal_date. Posting credits original cost, debits accumulated depreciation, debits proceeds and debits losses/credits gains.
3. The fixed_assets row stores disposal proceeds and linked journal but NOT the proceeds-account or gain/loss-account IDs. Therefore a balanced disposal journal and matched cost/accumulated totals cannot independently certify the full disposal account classification.
4. A subsequent reversal can leave the source asset marked disposed; source and journal status mismatch must be flagged, not silently auto-corrected.
5. Register-only CSV import does not post asset acquisition journals or opening balances.

## Source evidence contract added (pure, read-only)
- src/lib/accounting/fixed-asset-posting-evidence.ts
- src/lib/accounting/fixed-asset-posting-evidence.test.ts

The depreciation reviewer cross-checks source/run/date/idempotency, ownership, per-asset amount/cost constraints, account-side postings, exact minor-unit debit and credit totals, duplicate identities, reversed journals and company base currency. It uses BigInt for exact totals and never nets debit/credit account sides prematurely.

The disposal reviewer checks asset status, source journal/date/idempotency, accumulated depreciation entries, cost-account credits, accumulated-account debits, journal balance and proceeds/gain-loss arithmetic. Even with no issue, it returns PARTIAL, not MATCHED, until proceeds/gain-loss account classifications can be proven from separately verified journal evidence.

Neither function queries Supabase, posts a journal, changes assets, stores a review, nor provides a production UI by itself. Integration must wait for a scoped, permissioned evidence reader.

## Release risks and priorities

| Priority | Risk | Required mitigation |
| --- | --- | --- |
| High | PR #111 remains unmerged with full tests not executed | Run local typecheck/lint/Vitest/build and authenticated RLS tests; review its diff before merge |
| High | Account-level register-to-GL balances can match while individual posted depreciation/disposal journals are wrong | Add bounded tenant-scoped source-to-GL evidence endpoint; use the pure reviewers |
| High | Never-registered acquisitions can fall outside the account set | Add separate bill/bank/manual-source discovery and label incomplete coverage |
| High | Disposal proceeds/gain-loss account IDs absent from asset record | Do not claim complete posting classification; verify original immutable source separately |
| High | PR #111 reconciliation uses company membership, not explicit accounting.view | Confirm intended role matrix before exposing GL balances in Accounting |
| Medium | Concurrent register/GL reads are not atomic | Timestamp and recheck before resolution, especially during postings |
| Medium | A reversal can invalidate the linked asset's recorded lifecycle | Show linked source/journal inconsistency, never auto-post/correct |
| Medium | Imported opening register costs and depreciation may not match opening GL | Reconcile source provenance without inventing balancing journals |
| Medium | Current account mappings may differ from historical | Do not infer historical postings solely from current mapping |
| Medium | No durable review approvals exist | Build permissioned ownership and audit history only after evidence queries are verified |

## Planned next batches
1. Batch 1: audit source contracts, define and commit independent pure GL evidence reviewers and tests (this batch).
2. Batch 2: add authenticated, read-only, tenant-scoped, bounded evidence fetching for one depreciation run and one asset disposal; fail closed on truncated records; no posting changes.
3. Batch 3: integrate Fixed Assets exceptions and explicit partial/unchecked coverage into the Accounting Exception Centre, coordinating the existing open PR #111.
4. Batch 4: persistent review ownership/status/comments in a properly permissioned Supabase schema with RLS.
5. Batch 5: immutable review history, resolution verification, escalation and audit export.
6. Batch 6: full non-CI repository tests, integration/E2E and authenticated staging/production verification.

## Mandatory gates before claiming production readiness
- Run locally: npm.cmd run typecheck; npm.cmd run lint; npm.cmd test -- src/lib/accounting/fixed-asset-posting-evidence.test.ts; npm.cmd run build.
- Validate two unrelated organisations with genuine member/permission roles; source-company and journal-company mismatch must be blocked.
- Check SQL-vs-TypeScript parity for monthly rounding, residual cost, disposal gain/loss, reversed journals and period lock dates.
- Verify no depreciation journal exists for a zero-amount nothing-left run; do not classify this as missing.
- Use test data for concurrent postings, duplicate runs and interrupted disposal; do not edit historical production journal records.
- Verify account balances match the Trial Balance at the same as-of date and that a register match does not hide source-level differences.
- GitHub CI: NOT RUN (per user instruction). Merging source is not deployment or production acceptance.
