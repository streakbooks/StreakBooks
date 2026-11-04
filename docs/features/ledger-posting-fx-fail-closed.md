# Ledger posting: fail-closed FX and calendar/amount contracts

**Priority:** P0 financial integrity · **Date:** 4 November 2026 · **Schema/data migration:** none

## Existing failure risk
`resolveFxRate` could return 1:1 whenever the `lookup_fx_rate_to_base` RPC was unavailable or returned an invalid/null value—even for foreign-currency journals. Explicit invalid rates were not rejected. The posting service accepted impossible ISO-shaped dates and converted exact bigint minor units to JS Numbers before checking safe range. These could lead to incorrect journal FX snapshots or misleading error handling.

## Implementation
- Require an explicit, finite, positive rate or a valid company/date-scoped `lookup_fx_rate_to_base` result whenever a currency code is supplied.
- Do not silently use 1:1 when the FX RPC is absent or returns invalid data. No-currency base journal keeps intentional 1. Existing base-currency lookups return 1 when the server verifies it.
- Preserve the database's authority over period locks, company permissions, posting balance, idempotency and rate snapshots; no new posting service.
- Real-calendar validation for posting and automatic-reversal dates before any RPC. Reject unsafe exact minor-unit amounts **before** rate lookup.
- Reject unsafe numeric bank categorization amounts before double-entry processing.
- Pure tests cover valid base/foreign rates, no-rate and RPC-unavailable errors, malformed results, role-error propagation, unsafe amounts, invalid dates and idempotent request shapes.

## Release and acceptance
- Exact-head CI: TypeScript, ESLint, all unit tests, isolated PostgreSQL, navigation and production build.
- Manual non-production: an authorized test user can post a GBP base journal, a EUR journal with an explicit approved rate, and a foreign-currency journal with a preconfigured manual rate. Missing/inactive rate must fail **without a posted journal**. Check reversal scheduling after year-end and locked-period dates are rejected.
- No live rate/ledger data is changed by this PR. Test with a disposable company and reconciled initial trial balance.
- This is not country tax certification or a substitute for signed-in, multi-company financial sign-off.

## Known follow-up
Review `lookup_fx_rate_to_base` and other SECURITY DEFINER RPCs for independent SQL authorization checks. The new client-side fail-closed policy does not by itself guarantee privileged-function tenant isolation. Review historical journals for any old 1:1 snapshots only under approved read-only audit.
