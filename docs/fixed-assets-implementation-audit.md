# LinkBooks Fixed Assets — implementation and verification ledger

This is an evidence-based engineering record, not a claim of production readiness.

## Scope and current evidence

| Requirement | Status | Evidence / remaining verification |
| --- | --- | --- |
| Asset register CRUD | Implemented in source; unverified end-to-end | `src/lib/fixed-assets/fixed-assets.functions.ts` exposes save/delete and register functions. Verify authenticated UI, RLS, database and locked-period behavior. |
| Asset types | Implemented in source; unverified end-to-end | `saveAssetType`, asset type dialog. |
| Depreciation projection | Implemented in source; unverified end-to-end | `src/lib/fixed-assets/depreciation.ts` with integer minor units. Verify SQL parity with `fa_month_amount`. |
| Monthly posting | Implemented in source; unverified end-to-end | `runDepreciation` and database posting routines. Test concurrency, idempotency, permission enforcement and locked periods. |
| Disposal | Implemented in source; unverified end-to-end | `disposeFixedAsset` and `disposalLines`. Verify posted journal and GL effect. |
| Capitalise posted bill lines | Partial | Candidate selection exists. Verify no duplicate capitalisation, correct existing account mapping and bill/asset links. |
| Register search and status filters | Implemented in source; unverified in browser | `src/routes/_authenticated/fixed-assets.tsx`, commit b2d42e9. |
| Financial summary | Implemented in source; unverified in browser | Uses active asset cost and register-derived accumulated depreciation. |
| Filtered CSV export | Implemented in source; unverified in browser | CSV escape and spreadsheet formula safeguards, commit b2d42e9. |
| Depreciation and disposal regression tests | Added; not executed | `src/lib/fixed-assets/depreciation.test.ts`, commit c4023ba. |
| General ledger reconciliation | Not implemented / not evidenced | Requires account-specific GL balance vs register cost and accumulated depreciation, as-of date, exception drill-down. |
| Separate tax depreciation books | Not implemented / not evidenced | Requires country-specific accounting policy and independent schedules. |
| Depreciation pools | Not implemented / not evidenced | Requires pool lifecycle, jurisdictional rules, audit trail. |
| Impairment and revaluation | Not implemented / not evidenced | Requires appropriate policy, journals, approval and reporting. |
| Asset transfers and physical stocktake | Not implemented / not evidenced | Requires dimensions, custodians, history, location checks. |
| Partial disposal, improvements and construction-in-progress | Not implemented / not evidenced | Requires cost layers, asset components and journals. |
| Import with validation and error reporting | Not implemented / not evidenced | CSV export is not import. |
| Scheduled runs and approvals | Not implemented / not evidenced | Requires scheduler, locking and user approvals. |
| Cross-tenant RLS and permission penetration tests | Not verified | Must test with real users and separate organisations. |
| Typecheck, lint, unit tests, integration tests and production build | Not verified | No execution evidence available in this work session. |

## Release gates

1. Do not mark a feature Pass based on code presence alone.
2. Verify SQL and TypeScript depreciation parity for rounding, residuals and dates.
3. Test double entry, locked periods, reversal and idempotency against the actual database.
4. Test concurrent depreciation and disposal requests for duplicate or inconsistent journals.
5. Verify tenant isolation, RLS and role permissions for every asset endpoint and attachment.
6. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- src/lib/fixed-assets/depreciation.test.ts`, and `npm.cmd run build` in the project environment. Record output.
7. Validate sample asset purchases, depreciation, disposals and reconciliation against trial balance and balance sheet.
8. Do not merge to main or release without explicit review of failures and limitations.

## Design policy

Research competitors for accounting requirements, not UI/code replication. Keep LinkBooks workflows original. Preserve existing features and data; no silent scope reduction. Preview substantial UI changes before implementation.
