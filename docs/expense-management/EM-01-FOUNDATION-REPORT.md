# EM-01 — Foundation report

**Result:** Partially completed — local foundation verified; migration not applied; not pushed/merged/deployed.

## Completed in this batch

- Repository audit and gap analysis (`EM-00-AUDIT-AND-GAP-ANALYSIS.md`).
- 12-batch progress tracker (`EM-PROGRESS-TRACKER.md`).
- Additive migration `20261107120000_expense_management_foundation.sql`:
  - Expanded `expenses.*` permissions with segregation of approve / post / reimburse.
  - `expense_management_settings`, `expense_categories`, `expense_claims`, `expense_claim_lines`, `expense_claim_events`.
  - Separate approval / posting / reimbursement status columns.
  - Claimant-scoped RLS SELECT; writes reserved for SECURITY DEFINER RPCs.
  - `get_expense_management_settings` / `save_expense_management_settings` RPCs.
  - Document sequence `expense_claim`; tracking entity types extended; demo reset clears EM tables.
- TypeScript catalogue: `permissions.ts`, `access-catalogue.ts` (including pre-existing payroll catalogue gap), feature registry label.
- Domain lib: `src/lib/expenses/*` status machines, settings mapping, server functions.

## Explicitly not done in EM-01

- Navigation workspace / dashboard (EM-02).
- Claim CRUD UI and cutover from `employee_expense_claims` (EM-03).
- Journal posting changes (EM-06).
- Applying the migration to any database.
- GitHub push/PR/merge/CI/deployment.

## Tests run

```
npm.cmd run test -- src/lib/expenses src/lib/access-catalogue.test.ts
```

Result: **4 files, 18 tests passed**.

Full-repo `tsc --noEmit` still fails on pre-existing `notifications.tsx` / `ai-assistant.tsx` errors unrelated to this batch. No expense-path TypeScript diagnostics reported for the new files.
