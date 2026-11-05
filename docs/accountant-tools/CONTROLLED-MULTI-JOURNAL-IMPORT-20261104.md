# Accountant Tools: controlled multi-journal import

## Implemented
- Multi-journal CSV upload in the existing Journals panel, reachable from Accounting and Accountant Tools.
- Header contract: journal_key, journal_date, memo, account_code, description, debit, credit.
- Group up to 25 journals, 200 combined lines and 256 KB, with individual account, balance, precision, calendar-date, account-control and safe-integer validation using the established single-journal validator.
- Reject possible duplicate journal groups with matching posting date, memo and posting lines.
- Preview and individually select journals; uploading never posts. Show an explicit confirmation before any posting.
- Each selected journal is submitted through the existing authenticated and journals.manual-authorized accounting posting function, respecting period locks and the shared ledger engine.
- Stable organization/file SHA256 fingerprint and per-index idempotency keys allow safe retries, including after reupload.
- Persist per-item success/error results while the panel is open; never retry confirmed successful journals in that panel.
- Add focused pure tests for grouping, validation, duplicates, size/quantity limits and deterministic keys.

## Important constraints
- Batch posting is NOT atomic across multiple journals; prior successful rows remain posted if a later row fails.
- This does not implement separate preparer/approver controls, a persisted staging register, or approval notifications.
- A full audit of all source-document posting routes is not included; only manual journal posting uses this flow.
- No database migration, ledger model change, period lock bypass, or automatic write on file upload.

## Manual acceptance checklist
1. Stage two balanced journals; verify zero ledger changes before explicit confirmation.
2. Select one; post and verify only that journal appears on the Journal list.
3. Simulate one failed/locked-period journal; confirm separate success/failure and retry behavior.
4. Reimport the same company and file and verify the posting engine honors idempotency.
5. Reject unknown, control and inactive accounts, malformed date, conflicting metadata, unbalanced entries, unsafe precision, and identical duplicate journal content.
6. Check a read-only accountant cannot enter or post through the import action.
7. Run two-tenant authorization checks, mobile keyboard QA, and confirm CSV import template.

## Still pending from the entire Accountant Tools roadmap
- Server-persisted approval and versioned staging for multiple journals.
- Secure file-backed workpaper evidence, full reconciling-item schedules and sign-off consistency.
- Persistent exception dispositions, assignments, audit trails and reviewer attestations.
- Human-reviewed reconciliation suggestions, richer rules, and accountant automation.
- Client evidence request delivery and advanced month-end reminders.
- Authenticated staging browser E2E and production security/performance qualification.
