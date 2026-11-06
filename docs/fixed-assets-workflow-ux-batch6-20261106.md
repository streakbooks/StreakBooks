# Fixed Assets — Batch 6: Depreciation, GL reconciliation and capital-purchase review UX

Date: 2026-11-06. Authoritative repository: `linkbusinessadvisory/LinkBooks`.
Source branch: `feature/fixed-assets-register-safety-ux-20261106`.
Draft PR: #111. **Source committed only; no CI, local test execution, merge or deployment.**

## 1. Depreciation preview and controlled posting

Changes:
- Validate the selected month before calling the server, showing an actionable inline error.
- Provide a read-only summary: assets ready, assets with earlier months outstanding, done/fully depreciated, and charge in the **selected single month**.
- Validate returned preview line IDs, due charges, accumulated values, and exact total before enabling posting. Missing, duplicated or unsafe figures fail closed with an explicit error.
- Add an all/due/earlier/other status filter and 25-row pagination to avoid gigantic preview tables.
- Replace native `window.confirm` with a labelled, accessible confirmation dialog stating first and last posting months, period count, available preview charges, posting consequences and remaining backlog.
- Limit each catch-up request to **36 consecutive months**, the current server-side API maximum. If more months are outstanding, expose how many remain and require separate subsequent review. Do not silently send 37+ months or invent the multi-month charge from a one-month preview.
- Block a one-month posting when earlier months are outstanding, when the preview is stale or invalid, or when the current user lacks journal-posting permissions. Server-side permissions, locks, idempotency and accounting calculations remain authoritative.
- Show each period actually returned by the run, posted asset count and amount, as well as partial failures and retry warning. Do not describe unverified previews as successful journal postings.

Pure helper: `src/lib/fixed-assets/depreciation-review.ts`.
Focused tests: `src/lib/fixed-assets/depreciation-review.test.ts` (status and exact totals, duplicates, unsafe values, 36-month cap, leap year, malformed months).

## 2. Reconcile to GL: prioritised differences, no automated adjustments

Changes:
- Account-code/name search, filter status, sort by greatest absolute GL-minus-register difference or account number, and 25-row pagination.
- Show **gross absolute differences** alongside signed net variance and separate counts of accounts with greater or lower GL net debit. Opposite-sign discrepancies must not falsely cancel in the primary exception total.
- Per-account **Explain** action reveals a cautious interpretation of the direction and suggested investigation: account journals, unregistered acquisitions, accumulated depreciation, mapping, opening balances, and disposals.
- Real **GL entries** drill-down still opens the inception-to-date, account-filtered general ledger. CSV exports all filtered report rows (not just the visible 25-row page).
- Guard invalid calendar dates, stale results and malformed reconciliation values. No adjustment journal, approval, write or exception sign-off is implemented.

Pure helper: `src/lib/fixed-assets/reconciliation-review.ts`.
Focused tests: `src/lib/fixed-assets/reconciliation-review.test.ts` (gross variance, offsets, exact large values, filtering, sorting, explanations, duplicate/inconsistent statuses).

## 3. Review bill purchases: clearer flags and duplicate prevention

Changes:
- Add contextual **Why flagged?** explanations and human review steps for unlinked, partial, linked, foreign-currency, overlinked and non-purchase entries.
- Present an authorised link to the actual posted supplier bill for investigating the source transaction.
- **Review / add asset** appears only for positively-valued **unlinked** or **partially linked** candidates, and still requires existing `accounts.manage` permission. For fully linked, FX-linked, overlinked and non-purchase candidates, show the review guidance without offering a duplicate-prone asset-creation action.
- Apply the same eligibility rule to the older **Capitalise from a bill** chooser.
- Invalid dates, stale source data and unusable amounts no longer allow exports or classification without a visible error.
- Nothing is automatically capitalised, posted, reversed or reconciled; the cost basis, FX rates and tax treatment must be reviewed by a human.

Updated helper: `src/lib/fixed-assets/capitalisation-review.ts`.
Tests extended: `src/lib/fixed-assets/capitalisation-review.test.ts` (action eligibility and guidance for all six statuses).

## 4. Limitations and pending verification

- **Not production verified**: code was committed to a draft PR, but local typecheck, lint, unit tests, browser tests, authenticated RLS checks, database integration checks, performance checks, staging and deployment were not executed.
- No GitHub Actions or GitHub CI were triggered, per owner instruction.
- No new SQL migrations, API endpoints, journal-posting operations or permission policy changes in this batch.
- Remaining product work: complete authenticated/real-device keyboard/mobile testing, historical mapping/FX review, true non-bill capitalisation discovery, exception ownership/sign-off and scalable server-side pagination.
- If any source query changes after a preview, the server recalculates and validates posting. The preview does not guarantee a journal will post; subsequent periods can be blocked by period locks.
- The user should not interpret the reconciliation gross difference or purchase-review indicators as audited differences, tax depreciation, or journal suggestions.

## 5. Suggested local verification without GitHub CI

Safeguard your work in Cursor before switching branches:

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch origin
git switch feature/fixed-assets-register-safety-ux-20261106
git pull --ff-only origin feature/fixed-assets-register-safety-ux-20261106
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run check:navigation
npm.cmd run build
npm.cmd run dev
```

For first local checkout use `git switch --track origin/feature/fixed-assets-register-safety-ux-20261106`. Never discard a non-clean local Cursor worktree automatically.

Manual QA:
1. Preview a valid month; try no assets, due, behind, done, fully depreciated, invalid or future month.
2. Check permission restrictions on posting and that a failed preview disables posting.
3. Preview 37+, 83+ and exactly 36 months of arrears. Confirm each request only includes 36 or fewer periods; repeat after running and inspect the result log.
4. Verify partial-period lock failure: prior posted months remain visible, blocked month and error are explicit.
5. Check selected-month preview charges differ from real multi-month totals and that the UI does not promise a catch-up amount.
6. Reconciliation: two accounts with equal and opposite variance should have zero net but positive gross absolute difference; sorting must rank largest discrepancies first.
7. Reconciliation: inspect account-specific explanation and actual account GL entries; filter, page and export.
8. Bill review: inspect each status and its guidance, source bill navigation, FX warnings, valid/invalid date, stale values and new asset creation eligibility in both entry points.
9. Cross-company RLS, permissions, mobile breakpoints, keyboard-only navigation and screen-reader announcements must be verified manually.
10. Re-test previous Fixed Assets batches (register details, dashboard, saved filters, reconciliation and exports) against the latest `main`.

## 6. Next batch

**Batch 7 — Integration, accessibility, regression and release-hardening**: run and repair local TypeScript, ESLint, unit/integration, browser/UI contracts, data/security tests; reconcile the branch with current `main`; address verified issues, then decide readiness. Do **not** merge or deploy merely because the draft PR currently shows mergeable.
