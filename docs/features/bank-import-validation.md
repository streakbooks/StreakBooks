# Bank import: strict input and minor-unit validation

**P0:** security, exact minor-unit correctness and date integrity. **Independent clean-room design.**

## Existing functionality
All bank imports flow through `previewBankImport` and `importBankStatement`, which enforce company permission and scoped bank-account identity. QIF was added in PR #26. The previous server-side validator checked only the `YYYY-MM-DD` text pattern, coerced amounts with `Number()`, and accepted duplicate source IDs and row numbers.

## Change
- Shared, pure server-side `validateBankImportRows` enforces real ISO calendar dates (including leap days), true safe-integer signed minor units (zero refused), nonempty description, bounded and unique external transaction IDs and unique row numbers; invalid types and duplicate overrides are rejected.
- The browser uses `toSafeMinorNumber` before requesting a duplicate preview, so a BigInt amount cannot be rounded as it crosses the JSON/API boundary. It remains visibly reported as an import error until an exact-string server API is designed.
- The existing company/bank authorization, imports/audit, source table, SQL and posting engine are unchanged.
- Regression tests cover US/UK/AU/NZ date ambiguity, invalid days, decimals and overflow, duplicate IDs, same-content distinct transactions, optional fields, and maximum batch size.

## Acceptance
Run TypeScript, formatting/ESLint, all unit tests, isolated PostgreSQL, navigation and production build on the exact PR head. With an authorized **test** bank account, preview a malformed date and overly large minor-unit amount and confirm neither can be submitted. Check that the existing CSV, OFX/QFX and QIF import flows still allow valid data, and verify repeated statements do not duplicate existing imported rows. Signed-in tenant-negative tests still require staging credentials.

No new dependencies, financial postings, migration or real client data. Public banking concepts only; no third-party source or layouts reused.
