# Tax engine: fail-closed amount, quantity and treatment validation

**P0 financial integrity** · 4 November 2026 · **No tax-rate, filing, schema or dependency changes.**

## Existing behavior
The LinkBooks tax calculation already uses BigInt for line totals and applies an existing half-up rule for the tax component. It accepts quantity as a JS number and multiplies by a one-million scale. Before this change, `BigInt(number)` could receive an unsafe rounded monetary Number, quantities with more than six decimals were rounded silently, and an unknown runtime tax treatment was treated as tax-inclusive.

## Independent implementation
- Reject non-safe-integer numeric minor units; require `bigint` for values beyond the JavaScript safe integer range.
- Reject non-finite or non-positive quantity, quantity below one-millionth, more than six decimal places, or a quantity too large to be represented at the six-decimal scale. Normal floating representation noise near exact six-decimal inputs remains tolerated.
- Reject unknown tax treatments instead of defaulting to inclusive. No changes to existing exclusive/inclusive tax formulas, reporting, source rounding rules, invoices, tax rates or posted history.
- Retain country packs' truthful `filingStatus: not_implemented` metadata for US, UK, Australia and New Zealand.

## Tests and acceptance
Vitest tests for unsafe price/discount numbers, minuscule and fractional quantities, invalid treatment, six-place quantities, exact BigInt amounts and unchanged half-up tax calculations. Require exact-head GitHub TypeScript, ESLint, unit, isolated PostgreSQL and production build. Authenticated tax-report fixtures, country-specific tax control reconciliation, HMRC MTD, ATO BAS, IRD filing and US state filing integrations remain separate regulatory work.

## Clean-room and licensing
Derived solely from LinkBooks accounting invariants and numeric safety, not Odoo/Xero code, templates or layouts. No npm dependencies, migrations or live Supabase writes.
