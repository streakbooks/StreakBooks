# Accountant Tools — Journal Quality Review (4 November 2026)

## Implemented

- Collapsible manual journal quality review in the existing Journal panel, reachable from both Accounting and Accountant Tools.
- Read-only, authenticated, company-authorized scan of posted manual journals within a selected date range of at most 366 days.
- Flag possible exact duplicates on the same posting date and currency, with identical normalized narration and debit/credit account lines. Reversed entries are excluded.
- Flag unbalanced posted lines, unsafe amounts, lines with both debit and credit, zero-value lines, missing narrations and missing ledger lines.
- Drill down to both the flagged journal and any matched journal.
- Export findings and currently loaded journal rows as formula-neutralized CSV, with a clear 500-row coverage limit.
- Stable pure tests and server boundary tests for permissions, tenant scoping and truncation.

## Safety and correctness

- Server function uses authenticated middleware and requires accounting.view permission for the selected organisation.
- Query filters company_id, posted status, manual source and posting dates before returning data.
- Every monetary comparison uses integer minor units and bigint totals; no floating point rounding is used.
- Identical entries can be legitimate; duplicate findings always require accountant investigation. No automatic reversals, corrections, approvals or ledger updates are offered.
- Missing lines may indicate data integrity or permission problems; the user is asked to investigate rather than shown an unsupported conclusion.
- A 500-entry limit requires narrow date ranges for large populations and is explicitly displayed to users.
- This tool does not replace a certified account reconciliation, approved workpaper or full ledger audit.

## Production acceptance checklist

1. Run both accountant and read-only sign-ins; confirm view/export only where permitted.
2. Test two-tenant isolation and manipulated company identifiers.
3. Verify journal drill-down, the 500-entry boundary and form date-range errors.
4. Check zero journals, mixed currencies and multiple normal repetitive monthly accruals.
5. Import exported CSV into a spreadsheet and confirm leading formula characters do not execute.
6. Check responsive layout, keyboard navigation and error-handling states.

## Still pending from overall Accountant Tools brief

- Persisted exception dispositions and independent sign-off.
- Full workpaper reconciliations and attachment-backed lead schedules (under a separate concurrent PR).
- Journal import, bulk approval and enterprise journal management.
- Automated document requests, account reconciliation recommendations and explainable AI.
- Full authenticated end-to-end staging acceptance and large-dataset performance certification.

This PR does not introduce migrations or modify posted accounting data. It is one safe development increment, not completion of the entire module upgrade.
