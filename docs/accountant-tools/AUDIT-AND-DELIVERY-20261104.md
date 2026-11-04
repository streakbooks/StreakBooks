# Accountant Tools — scoped audit, competitor mapping and delivery

**Reviewed:** 4 November 2026
**Repository:** linkbusinessadvisory/LinkBooks
**Scope:** Authenticated Accountant workspace and its connected accounting, practice, banking, reporting and tax flows. This is a source and architecture review, not a full live multi-role certification.

## Verified code inventory

| Capability | Actual implementation | Status |
|---|---|---|
| Dated accountant exception queues and journal activity | src/lib/accountant/accountant.functions.ts; src/routes/_authenticated/accountant.tsx | Implemented, but staging UAT required |
| Practice tasks, bulk transitions, deadlines, assignees, preparer/reviewer separation and CSV | src/components/accountant/PracticeWorkBoard*; src/lib/accountant/practice*.ts; migrations dated 20261101 | Implemented, with focused tests |
| Manual and recurring journals, posted journal reversal | src/components/accounting/JournalsPanel.tsx; src/routes/_authenticated/recurring-journals.tsx; shared posting services | Existing workflows; full approval/import coverage not verified |
| Transaction correction/reclassification workspace | src/components/accounting/corrections/TransactionCorrections.tsx; related 20261101 SQL migrations | Exists; verify batch, lock and tax constraints individually |
| Bank reconciliation | src/routes/_authenticated/banking/reconcile.tsx and reconciliation services | Exists; not a balance-sheet workpaper system |
| Financial close checks, period locks and year-end close | src/components/accounting/PeriodClosePanel.tsx; posting/close services | Exists; negative-path staging UAT remains |
| Tax adjustment journal | src/lib/tax/tax.functions.ts and Accountant route | Server-validated, permission-checked ledger adjustment; not return filing |
| Accounting RLS | Supabase tables practice_tasks, journals, journal_lines, accounting_periods and reconciliation_sessions have RLS enabled | Requires cross-tenant and role-level verification |
| Dedicated GL-linked lead schedules, account reconciliation workpaper sign-offs | No dedicated workpaper table discovered in the inspected public schema or scoped code tree | Gap requiring implementation |
| Explainable automated accountant suggestions with approval | Not verified in Accountant code | Not established |

## Competitor evidence and design implications

- QuickBooks Online Accountant: prep-for-tax review, bulk reclassification and reconciliation tools. Official guidance: https://quickbooks.intuit.com/learn-support/en-us/help-article/small-business-processes/use-accountant-tools-features-quickbooks-online/L5rizTAvS_US_en_US
- QuickBooks transaction constraints: source-specific restrictions prevent unrestricted edits to subledger-linked entries. https://quickbooks.intuit.com/learn-support/en-us/help-article/reclassify-transactions/reclassify-move-multiple-transactions/L249lPKyg_US_en_US
- Xero: role-sensitive lock dates prevent changes to prior accounting periods. https://central.xero.com/s/article/Set-up-and-work-with-lock-dates
- Odoo 19: configurable reconciliation rules and a dedicated accounting audit trail. https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/reconciliation_models.html and https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting.html

Edition, subscription and jurisdiction restrictions matter. These are workflow benchmarks, not instructions to copy layouts or proprietary code.

## Delivered in this feature branch

1. Six URL-addressable Accountant Tools sections: Overview, Client Work, Journals, Reconciliation, Period Close and Tax Adjustments.
2. Real existing practice board, journal list/reversal controls and close checks integrated into one workspace; navigation to authoritative bank reconciliation and correction flows.
3. Lazy fetching of overview queue data and adjustment account selections.
4. Tax posting form now rejects obvious same-account, nonpositive-amount or short-reference inputs before mutation. Server protections remain mandatory.
5. Successful tax adjustment rotates the idempotency reference and clears the amount/memo; retries retain their reference until successful.
6. Added pure parser tests for the six tab identifiers and invalid deep-links.

No ledger schema, posting RPC, financial data or production database was changed. This is an initial functional UI/integration phase, not a claim that the full Accountant Tools development brief has been delivered.

## Prioritized remainder

**P0 release verification:** Run GitHub CI, staging browser checks with accountant/preparer, independent reviewer, admin and read-only roles, two companies and locked period negative cases. Verify mobile keyboard interactions, journal reversal and report drill-down.

**P1 accounting workpapers:** Implement tenant/period/account-scoped schedules, GL-derived balances, independent evidence balances, reconciling items, attachments, snapshot versions, review sign-offs, exports and reliable cross-period carry-forward. A completed task must never be treated as a reconciled balance.

**P1 safe bulk review/reclassification:** Add a documented source-specific transaction correction matrix, change previews, tax/FX/closed-period/subledger protections, per-item error handling and before/after audit history.

**P1 accountant automation:** Build nonposting recommendations for reconciliation candidates, suspense, missing evidence and duplicate journal entries. Require reasons, audit trail and human confirmation.

**P2 practice integration:** Client evidence requests, recurring deadlines, engagement tracking, workload capacity and multi-client coordination with strict client confidentiality.

**P2 journals and compliance:** Review advanced journal approval, import validation, scheduled reversals and jurisdiction-aware closing templates for compatibility with the existing one-ledger posting engine.

## Verification matrix

| Check | Current state |
|---|---|
| Source code changes | Committed to feature branch |
| Unit tests for tab parser | Added; execution pending GitHub CI |
| Full authenticated browser and multi-role review | Pending |
| Automated accounting regression and performance certification | Pending |
| Production migration / production data changes | None |
| Merge and deployment | Not performed |

**Mandatory invariant:** one authoritative ledger, enforced organisation permissions and RLS, immutable posted history, explicit approvals for sensitive changes and no destructive production operations without authorization.
