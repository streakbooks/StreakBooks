# LinkBooks import implementation audit — 30 October 2026

This is an evidence-based progress snapshot, **not** a completion certificate. UI-only buttons, schema definitions and CSV previews are not counted as working domain imports.

| Module | Import writer | Evidence / limitation |
| --- | --- | --- |
| Banking | Existing CSV workflow | `src/lib/banking/import.functions.ts`; domain reconciliation and journal posting still require E2E review. |
| Contacts | Existing basic CSV workflow | `src/routes/_authenticated/contacts/import.tsx`; additional duplicate and permission tests required. |
| Accounting | Existing chart-of-accounts import | `src/lib/accounting/account-import.ts`; journal and opening-balance imports are not covered. |
| Budgets | Existing monthly-budget CSV support | `src/lib/budgets/budget-csv.ts`; live permission/integration verification outstanding. |
| Products & Services | **Catalogue import merged in PR #19** | `src/lib/imports/products-import.functions.ts`, server permission `products.manage`, exact minor units, active-SKU unique index, audit-event error reporting. **Non-posting catalogue; not stock valuation.** |
| Projects | **Master-data writer merged in PR #21** | `src/lib/imports/projects-import.functions.ts`, server `accounts.manage`, exact customer resolution, company-scoped unique code, audit-event error reporting. **Non-posting master data.** |
| Sales | Not implemented | Invoices and payments need domain-service-backed draft/authorise workflows, tax, AR control and posting tests. |
| Purchases | Not implemented | Bills and payments need domain-service-backed workflows, tax, AP control and posting tests. |
| Fixed Assets | Not implemented | Asset register imports must use asset domain rules, depreciation and opening-balance reconciliation. |
| Inventory | Not implemented | No stock-on-hand / COGS valuation engine claimed. Do not import stock quantities as a catalogue substitute. |
| Payroll | Not implemented | Country-specific payroll validation and statutory handling outstanding. |
| Tax | Not implemented | Tax-rate and tax-code permissions and effective-dated handling outstanding. |

## Verification evidence

- PR #17: merged; route-tree fix and shared Import Centre.
- PR #18: merged after successful CI; malformed CSV quoting rejected.
- PR #19: merged after successful typecheck, unit tests and build; product catalogue writer.
- PR #21: merged after successful typecheck, unit tests and build; project master-data writer.
- Existing GitHub CI runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- PR #20 proposes adding repository-wide lint. Its initial run found **2,952 baseline lint problems (2,935 errors, 17 warnings)**. It remains unmerged; lint is **not** a passing repository-wide gate.
- Read-only live Supabase inspection confirmed `products` RLS, permission-based write policy, case-insensitive active-SKU unique index and `record_audit_event` RPC. No production test imports were written.
- Read-only journal check found 38 posted journals, 0 unbalanced, 0 with fewer than two lines, 0 nonpositive and 0 cross-organisation journal lines at inspection time. **This is not a full tax, inventory or multi-currency accounting integrity audit.**
- A fresh **read-only AR aggregate** check found AR GL/open posted invoice balances of 480,000/480,000 minor units in each of the two organisations (zero aggregate differences). This is not a per-customer, per-period or FX reconciliation.
- Earlier `docs/audit/ACCOUNTING_RECONCILIATION.md` identified an AP-control/subledger mismatch. A fresh **read-only aggregate** check found AP GL/open posted bill balances of 0/0 and 1,000/1,000 minor units in the two organisations (no aggregate difference). This does **not** prove every supplier, period, FX or credit allocation reconciles; a complete AP subledger test is still required.

## Remaining release gates

1. Implement genuine Sales and Purchases imports via existing authorised domain posting functions; never insert directly into posted ledger tables.
2. Implement fixed-asset, inventory, payroll and tax import domains only after their underlying accounting engines are verified.
3. Run authenticated organisation-isolation and role-denial integration tests, idempotent concurrent-retry tests, audit-event tests and full GL/subledger reconciliation.
4. Resolve repository lint debt without disabling or weakening existing rules.
5. Verify the deployed app and database migrations independently of successful TypeScript compilation.

**Partial imports:** Product and project writers insert rows individually and report partial failures; they are not all-or-nothing transactions. Their audit-event failure is surfaced explicitly. Do not claim atomic batch import until a transactional server-side workflow is implemented.
