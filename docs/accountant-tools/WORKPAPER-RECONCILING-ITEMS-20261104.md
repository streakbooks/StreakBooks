# Accountant Tools — GL workpaper reconciling issue schedule

## Rollout verification

- The additive migration was applied and recorded in the connected Supabase project as `20261104080519_workpaper_reconciling_items`.
- Both new tables have RLS enabled, the authenticated write RPC denies anonymous execution, and no reconciling-item data was inserted during rollout.
- The concurrent Firm & Clients PR #50 was merged to main before this feature's final review. GitHub's combined PR CI must be rerun against the updated main; firm changes must remain intact.
- An authenticated multi-role staging-browser acceptance is still required to certify real-user UX.

## Delivered in this incremental change

- Adds a structured, tenant-and-workpaper-scoped register for identified reconciling issues with **exact signed minor-unit amounts**, descriptions, supporting evidence references, and open/resolved states.
- Includes an item editor, explicit evidence-backed resolution and reopening reasons, read-only history, and export to spreadsheet-formula-neutralized CSV.
- The register is available from Accountant Tools → Workpapers after saving the draft workpaper.
- All mutations use the existing role+MFA authorization model and a version-guarded, audit-logging PostgreSQL RPC.
- Direct INSERT/UPDATE/DELETE by regular clients is revoked. RLS restricts reading both active items and immutable events to authorized members of the relevant company.
- **Database-level sign-off gate:** a workpaper cannot transition from draft to prepared/reviewed when an item is still open, even if the user bypasses the UI and invokes save_account_workpaper directly.
- Edit/resolve/reopen actions lock the parent workpaper and refuse changes once it is prepared or reviewed, until the existing workpaper reopening workflow has been completed.
- Every edit increments the workpaper parent version so stale editors must refresh; events and accounting audit entries are written in the same transaction.
- Includes server-side schema validation and isolated PostgreSQL regression for tenant isolation, MFA, permission, amount safety, audit, optimistic locking and sign-off.

## Accounting integrity boundaries

- This is an **issue and resolution schedule**, not an automatic reconciling ledger or an adjusting-entry batch.
- An item is not an accounting entry. Neither creating nor resolving it changes posted journals, bank reconciliation matches, or the supporting/GL balances.
- The existing independent two-person workpaper sign-off and direct comparison of supporting balance to GL still apply. Closing all issues is **additional**, not a substitute for matching supporting evidence.
- A user must explicitly resolve an issue with evidence and a reason; resolved items remain historically visible. Delete operations are intentionally unavailable.
- Existing sign-offs are not invalidated retroactively by the database migration; existing prepared/reviewed workpapers cannot have items added without a reasoned reopening.
- No files are uploaded by this feature; evidence is a reference string. Secure workpaper-specific attachments and source-file verification remain separate follow-up scope.

## Local manual acceptance

1. In a test organisation, open Accountant Tools → Workpapers and save a draft for a balance-sheet account.
2. Add positive and negative reconciling issues and verify net open amount and CSV export.
3. Attempt to prepare the workpaper with an open issue; the database must reject it.
4. Edit the item and verify a stale version cannot overwrite a concurrent change.
5. Save an evidence reference; resolve with a meaningful written explanation and verify event history.
6. Reopen the item with a reason, check sign-off becomes blocked again, and resolve once more.
7. Ensure the parent workpaper can only be prepared with a matching supporting balance and all items resolved.
8. Verify an independent reviewer signs off, and items become read-only unless the workpaper is reopened.
9. Verify read-only accountants cannot edit, and cross-company identifiers cannot list or mutate items.
10. Verify mobile keyboard access, error states, signed-minor precision and workpaper CSV export.

## Still pending from the broader Accountant Tools brief

- Signed-off workpaper-specific file attachments and secure link verification.
- Persisted journal batch approvals with separate preparer/approver identities and atomic batch cancellation.
- Source-aware bulk transaction reclassifications across accounting documents, with tax/FX/lock-date guards.
- Explainable, nonposting bank reconciliation suggestions and suspicious-transaction analysis with human-reviewed dispositions.
- Client evidence requests, automated reminders and company-approved workflow scheduling.
- Full multi-role authenticated staging E2E, deployment verification and production finance/security acceptance.
