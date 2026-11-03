# Ledger health: Accounting workspace access

**Priority:** P0, user-visible integration · **Date:** 4 November 2026 · **SQL migration:** none

## Existing functionality
The repository already contained `LedgerHealthPanel`, the read-only `ledger_health_check` database function, authorization server wrapper and eight accounting check types. However, the panel was not rendered by the Accounting route, making it unavailable through the normal interface.

## Independent design and implementation
- Add a **Ledger health** native-link tab under `/accounting?tab=health`, adjacent to financial year/period-close tools.
- Render the existing `LedgerHealthPanel` with the currently selected company ID. Use a keyed mount so switching companies discards previous results.
- Preserve all existing tabs and deep links; no changes to posted journals or database policies.
- Preserve the existing click-to-run interaction; do not execute expensive ledger checks automatically on every render.
- Reject unsafe large minor-unit numbers in the integrity report detail parser to prevent rounded amounts being shown as exact.
- Extend authenticated Playwright navigation coverage and pure parser tests.

## Manual acceptance
1. Sign in as a user with `accounting.view` and open **Accounting → Ledger health** or `/accounting?tab=health`.
2. Click **Run health check**; confirm loading, timestamp, posted counts, pass/warn/fail/NA badges, actionable review links and detailed issues.
3. Open another company's ledger and confirm no prior results remain. A user without permission must receive an error, not ledger balances.
4. Refresh or Ctrl+Click the tab and verify URL/navigation state.
5. Confirm period-close and journal screens are unchanged.

## Known limits
The display is not a substitute for an independent financial audit. Large individual minor-unit values beyond JavaScript's safe integer are rejected until all details use exact numeric strings. Signed-in staging, alternate roles and full country-specific reconciliation are still required.
