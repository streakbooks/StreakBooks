# Accountant Tools — persisted journal exception investigation

## Implemented

- A tenant-isolated record for each human-reviewed manual-journal finding (journal ID + deterministic finding key).
- Investigation notes and status progression: Investigating -> Ready for independent review -> Reviewed, with reasoned reopening.
- Writes are only through an authenticated, accounting.post-permission-checked, MFA-guarded, optimistic-versioned SECURITY DEFINER RPC. Direct INSERT/UPDATE/DELETE is revoked from anon and authenticated roles.
- Independent sign-off is enforced in PostgreSQL; a preparer cannot approve their own exception review.
- Review status and event history are visible to accountants with accounting.view permission; both tables have tenant-and-MFA RLS.
- Immutable event history rows and audit events are written in the same transaction as each disposition.
- Strict checking that the referenced journal is posted, manual and owned by the selected company.
- An integrated investigation UI inside Journal Quality Review: choose a finding, enter evidence, submit, approve independently or reopen with reason.
- CSV export includes the current human review state without affecting the posted accounting entries.
- Focused server authorization, tenant, identity and audit-history query boundary tests.

## Security and accounting boundaries

- Findings are suggestions, not proof of financial misstatement. An approved investigation does not approve or modify the posted journal.
- Journal corrections must go through existing reversal/source-document correction procedures; exception metadata never mutates the ledger.
- An exception finding may be manually tracked after detection, but if the original scan no longer produces it (e.g. after reversal), it remains in the audit register rather than being silently deleted.
- Direct DML is not available to regular clients; SQL owner/service role remains an administrator boundary.
- Exposed public tables enable RLS and read-only authenticated grants; server and RPC each check permissions.
- No production migration should be applied before passing SQL/security validation in CI.

## Migration
- Additive SQL: supabase/migrations/20261104072943_accountant_journal_exception_reviews.sql
- Creates accountant_journal_exception_reviews and accountant_journal_exception_events, RLS policies and save_accountant_journal_exception RPC.
- No existing table rows, financial reports, posted journal entries or period locks are modified.

## Required acceptance
1. Verify a read-only accountant can view but not mutate exception review records.
2. Verify preparer submits investigation, and separate authorized reviewer approves.
3. Verify self-approval is rejected at the database boundary.
4. Verify stale version changes and cross-tenant journal ID manipulation are rejected.
5. Verify all statuses generate event history and audit entries transactionally.
6. Verify an investigation note edit after sign-off requires explicit reopening with reason.
7. Verify reporting/GL data is unchanged by every exception operation.
8. Check accessibility, keyboard, mobile and two-organization browser workflows.

## Remaining advanced Accountant Tools
- Full workpaper reconciling-item schedules with secure attachment-backed source evidence.
- Persistent pre-post journal batch approval workflow; current multi-journal import is per-journal controlled posting.
- Source-aware correction approvals and human-confirmed reconciliation suggestions.
- Client evidence request delivery, accountant automation and large-scale production E2E qualification.
