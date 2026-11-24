# Historical FX reporting — verified snapshots only

**Priority:** P0 accounting and reporting integrity · **Date:** 4 November 2026 · **No database migration or data writes.**

## Problem and source lineage
The canonical ledger report converts posted lines from journal currency to company base currency. The existing conversion helper previously returned unconverted transaction minor units when `fx_rate_to_base` was null, even if both known currencies differed. Additionally, unsafe JavaScript Numbers from JSON database responses could be rounded before conversion to BigInt and then presented as exact.

## Original implementation
- Fail closed for missing snapshot rates when the transaction and base currencies are both known and different; a successful conversion must use the **posted journal snapshot**, not a current/manual rate.
- Preserve base-currency identity when currencies match and legacy records with no declared currency, which are base-only amounts. No false 1:1 for known foreign journals.
- Reject non-safe-integer numeric minor amounts. Support exact integer strings returned by a data transport/adapter, retaining BigInt arithmetic and zero/2/3-decimal currency handling.
- Add focused tests at both the pure FX converter and canonical `rawLineToPosted` report adapter. No change to posted journals, balances, SQL RPCs, rate tables or accounting-period policies.

## Acceptance
The authorized user sees a clear error rather than wrong GBP/USD results for any foreign journal with missing FX provenance. Synthetic USD→GBP, JPY→USD, GBP base, unsafe JSON numbers and exact large numeric strings are verified in automated tests. Signed-in report and export review must independently confirm no data is silently truncated, and foreign journals that previously had missing rates need an approved **read-only** historical audit. Never backfill an exchange rate without accountant approval.

## Dependencies and clean room
No new npm dependencies, third-party code, templates, artwork or schemas. Derived from the original StreakBooks `fx.ts` and existing accounting invariants. Requires exact-head CI and bank/accounting acceptance before considering this part of production FX certification.
