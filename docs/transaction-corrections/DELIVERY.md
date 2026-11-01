# Transaction corrections — Linkbooks

1 November 2026. Original Linkbooks implementation, designed around its immutable posted ledger and existing posting/reversal services. The screenshots were used as examples of the business need, not as UI, wording or code to reproduce.

## Audit and product scope

Before this change, Linkbooks supported manual journals, source-document correction workflows and whole-account merges, but had no selective transaction-line reclassification workspace. Account merging changes the treatment of an entire account and is not a substitute for correcting selected transactions.

The delivered workspace is available at **Accounting → Transaction corrections**, with a shortcut from Accountant tools. It moves selected **income and expense GL amounts** between ordinary P&L accounts, preserving the original posted lines and source documents. It records traceable adjustment journals, a before/after plan, actor, reason and undo evidence.

This is not full Xero/QBO feature parity. It does not rewrite source invoices/bills, change tax codes, contacts, classes, locations, projects or inventory valuations, or change bank/AR/AP/control/balance-sheet legs. Source-document, cash-basis, dimension and operational reports may retain original source coding; the correction affects GL account reporting. Use the source workflow for those other changes. No unsupported option or dummy control is shown.

## Reference review

[Xero’s official overview](https://central.xero.com/s/article/About-Find-Recode-UK) describes source recoding and manual-journal methods. [Intuit’s official reclassification guide](https://quickbooks.intuit.com/learn-support/en-us/help-article/reclassify-transactions/reclassify-move-multiple-transactions/L249lPKyg_US_en_US) describes bulk account/class/location changes and limitations. These establish the accounting use case; Linkbooks uses its own layout, language, APIs, eligibility rules and correction manifests.

## Workflow

1. Search posted P&L lines by date range, current account, source type, description/memo/reference/contact, and minimum/maximum gross amount in company base currency. Foreign source amounts and their exact ledger base equivalents are shown separately. Base equivalents use the existing Postgres FX rounding routine, rather than comparing minor units of different currencies. Results page 200 lines, with explicit disabled reasons for ineligible rows. Amounts use their source currency’s reference precision, including excluded foreign rows.
2. Select up to 100 eligible lines for one destination account. Selection totals show gross magnitude, so credit notes do not cancel debit lines in the displayed selection value. Changing search criteria or page clears selection.
3. Choose an active ordinary income/expense destination and a documented reason. Posting policies:
   - **Original dates:** one correction journal per original posting date. Each date needs an open fiscal period and must pass the existing organisation lock policy.
   - **Open adjustment date:** one chosen date on or after all selected transactions. It affects account classification in that later period and does not restate an earlier locked period.
4. Preview exact source accounts, amounts, destination and posting dates. The server validates the complete batch, recomputes source fingerprints, checks permissions/MFA and produces a plan hash. Editing the destination, policy, date, reason or selection clears the preview and acknowledgment.
5. Review and acknowledge actual ledger posting. Download the plan when report-export permission is granted, then confirm posting. A stable request reference survives response loss for safe exact retries.
6. Inspect history, source-line identifiers, correction journal links and CSV evidence. Undo requires an explicit date/reason and posts reversing journals through the existing reversal service. Undo does not delete the original batch or its journals.

Evidence CSVs include stable source-line IDs, currency, exact debit/credit amounts, source/posting dates, account movement, reason, actor/timestamps and correction/undo journal references. Export UI respects `reports.export`; accounting read access still governs data already displayed in the browser.

## Accounting treatment

For a source expense debit of GBP 100.00 in account A moved to B:

| Posting | Account A | Account B |
|---|---:|---:|
| Original | Debit 100.00 | — |
| Correction | Credit 100.00 | Debit 100.00 |
| Result | Nil for this selected amount | Debit 100.00 |

A source credit uses the opposite direction. Each selected line contributes an equal offset and replacement; journals balance even when debit and credit selections mix. No money is recalculated through floating point. Minor amounts cross the new API as strings and use BigInt for display/filter math. Each batch is capped at 9,007,199,254,740,991 gross minor units to stay within the application’s supported monetary range.

Original-date mode preserves classification by original date. Adjustment-date and later-date undo intentionally affect classification in their posting periods. Tax, receivable/payable allocations, payments, bank reconciliation and source totals are not recomputed by this GL-only workflow.

## Integrity, security and concurrency

- `accounting.view` reads the workspace and company-scoped history; both `journals.manual` and `accounting.post` are required for preview/apply/undo. No new role escalation or user-metadata authorization is introduced.
- Verified MFA factors require AAL2. RPCs independently authorize their company; history/manifests have RLS and restrictive MFA policies. Anonymous execution and direct authenticated writes to manifest tables are revoked.
- Source amounts and account identities are loaded by the database. The client cannot submit replacement debit/credit amounts. Source fingerprints detect changed financial state; preview hashes detect a changed plan. Hashes are change detection, not authorization tokens.
- System-key/control/header/inactive/archived accounts, seeded rounding and depreciation accounts, foreign-currency postings/accounts, unsupported generated sources and pending/failed auto-reversal journals are excluded. Seeded ordinary P&L accounts remain usable even when their chart-structure `is_locked` flag is set; that flag does not prohibit ordinary postings.
- One active correction per source line is enforced by a unique partial index. Apply/undo serialize per company, lock source journals and relevant chart/period/policy rows, and repeat eligibility/lock checks before using the existing `post_journal` engine. Any error rolls back the entire batch.
- Exact retries return the existing batch; reusing a request reference with different parameters is rejected. An exact retry after undo returns the historical undone batch rather than silently posting again.
- A source journal with active corrections cannot be reversed. Undo all its active correction batches before voiding/reversing the source. This deliberately prevents orphaned classification entries.
- Undo verifies and reuses exact external reversals rather than posting duplicates. Reused reversals retain their actual dates, which are available through their journal links; the requested undo date is labelled as such. Invalid or reversed-again external reversals require accountant investigation. Correction reversal journals cannot themselves be reversed; create a new correction after undo instead.
- New privileged functions have fixed search paths and explicit auth/MFA/company permissions. Internal planning/view helpers are not directly granted to clients. Supabase’s generic [authenticated SECURITY DEFINER advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) flags the five intentionally exposed RPCs; their execution grants are necessary for the authorized transactional workflow, and were reviewed/tested rather than hidden. This is not a claim that the full project has no security findings.

## Database rollout

Applied to the connected Linkbooks database `ipxflpzfcqwtenodbxwc`, with repository filenames matched to observed migration history:

- `20261101112845_transaction_corrections.sql`
- `20261101113351_transaction_correction_guards.sql`
- `20261101115232_transaction_correction_search_amounts.sql`

Only schema changes were retained. All ledger/security test records were synthetic and enclosed in a transaction that rolled back. No real company’s journals or documents were reclassified during development.

## Verification

The real database suite is `supabase/tests/transaction_corrections.sql`. It exercises the shared posting engine under the authenticated role and verifies:

- Balanced GL movement and restoration after undo; exact preservation of original posted line identities/accounts/counts.
- Both debit and credit corrections, multiple original posting dates, and explicit current-period adjustments.
- Exact apply/undo retries; changed-request, duplicate-selection and stale-preview rejection; no partial write on stale preview.
- Protected destinations, same-account moves, active duplicate corrections, foreign postings, locks, and early undo rejection.
- Source reversal blocking; reuse of a verified external reversal; protection against reversing correction reversals.
- Company isolation, view-only posting denial, direct manifest-write denial, MFA read/write denial and anonymous execution denial.

Unit tests cover input/date/selection contracts, source precision lookup, zero/three-decimal currencies, money above JS’s safe integer range, exact filter conversion, invalid minor-unit input and gross selection values. The isolated browser fixture uses the actual presentation component with in-memory adapters; it checks search/exclusion, preview invalidation, acknowledgment, evidence CSV currency/amount consistency, posting/history/undo interaction, exact request-key reuse after a lost response, view-only controls, export denial and excess-precision rejection.

Run:

```text
npm test
npm run typecheck
npm run build
npm run test:corrections
```

The correction browser suite is included in GitHub verification. The isolated UI tests and real DB transaction tests verify separate boundaries; they are not an authenticated whole-application browser test. Remaining validation includes representative production exports, browser-to-live-source-document correction flows with test logins, parallel-client stress tests and large-ledger query plans. No enterprise throughput or universal production-readiness certification is claimed.

## Final check results

- 156 unit-test files / 1,186 tests passed.
- Five correction browser tests passed, including source-currency display, evidence export contents and exact retry references.
- Authenticated database posting/security assertions passed; synthetic ledger records and users rolled back.
- TypeScript, changed-file ESLint and production build passed. Existing framework deprecation warnings remain.
