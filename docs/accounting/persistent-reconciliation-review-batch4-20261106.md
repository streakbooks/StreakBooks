# StreakBooks Accounting — Persistent Reconciliation Review Cases (Batch 4 / 6)

## Source implementation

- New migration: \`supabase/migrations/20261106233000_reconciliation_review_cases.sql\`.
- Cases and immutable-style append-only events track investigation, assignment, comments, and operational status for findings from Ledger Health, FX, Deferrals, Payroll and Fixed Assets.
- Case statuses are **open / in_review / blocked** only. There is **no resolved, approved, cleared, or accounting-posting action** in this batch.
- Company, source and evidence fingerprint identify the case. Fingerprints are deterministic operational grouping IDs, **not** a cryptographic attestation. If detail/title/source/reference/journal/severity changes, it creates a different review identity; the old case history remains.
- Two *read-only* endpoints: \`listReconciliationReviewCases\` returns the latest 100 case rows; \`getReconciliationReviewCase\` finds a current case by exact company/source/fingerprint even if it fell outside the latest-100 queue.
- \`listReconciliationReviewAssignees\` only returns up to 100 active members to someone with both accounting.view and members.view. The database RPC separately verifies that an assignee is active and has effective accounting.view access.
- \`saveReconciliationReviewCase\` requires accounting.view AND accounting.post before invoking the database RPC. The SQL RPC independently enforces authenticated membership, MFA, accounting.view, accounting.post, company/journal ownership, input bounds, assignment eligibility and **row-locked optimistic versions**.
- Each open/assignment/comment/status action creates an event in the same database transaction. No direct table INSERT, UPDATE or DELETE grants to user roles; event rows have no client-write access.
- New \`PersistentReconciliationReviews\` panel in Accounting → Reconciliation exceptions. The preexisting "reviewed this session" checkboxes are **still temporary**, not replaced with a false approval. The durable case panel and operational statuses are separately labelled.
- No journal posting, reversal, automatic issue resolution, evidence mutation, automatic notification or fixed-asset lifecycle mutation.

## Security and release gates

- RLS enabled on both exposed public tables. Explicit SELECT-only grants to authenticated users, no grants to anon. Policies require auth.uid(), private.mfa_requirement_met(), membership and accounting.view.
- RPC uses SECURITY DEFINER with empty search_path and fully qualified user table references; it explicitly rechecks auth.uid(), MFA, company membership and accounting.view/accounting.post on every write, guarding against direct RPC bypass.
- Cross-tenant journal references are checked against public.journals; cross-company or inactive assignee is rejected, and effective accounting.view plus accounting.post permissions are checked through role grants/member adjustments.
- Existing cases require a non-null expected version; SELECT ... FOR UPDATE and version equality prevent racing updates; an open action cannot overwrite an existing source/fingerprint.
- Observations from audit endpoints are not independently certified by the queue; authorised reviewers are responsible for checking source evidence. Saved records preserve the original issue text, and must not be used as proof that the ledger is corrected.
- Case read endpoints are capped at 100 with a hasMore flag; exact lookup handles older cases. Result sets do not claim full organisation coverage.
- **Do not assume migration is applied** merely because it is committed to main. A deployment must deliberately apply and verify it before the UI can load durable cases.

## Tests and limitations

- Seven pure Vitest identity cases plus nineteen server mock Vitest cases **written but not executed**.
- Isolated JS/V8 focused source-derived hash checks (10/10) and separate static permission/schema/source inspections are not equivalent to full repository tests.
- No authenticated production Supabase SQL migration, schema deployment, UI browser, RLS integration, PR CI or Vercel production acceptance performed from this session.

### Acceptance before deploying

1. Run local \`npm.cmd run typecheck\`, \`npm.cmd run lint\`, \`npm.cmd run test\` and \`npm.cmd run build\` without triggering GitHub CI.
2. Review SQL with the project's standard Supabase CLI local migration workflow; inspect \`supabase --help\` for installed version (CLI v3 defaults to local rather than hosted).
3. Apply the reviewed migration to **staging first**, confirm the objects exist, verify SELECT-only authenticated grants and effective permissioned RLS, and inspect Supabase security advisors. Do not apply blindly to production.
4. Use two unrelated test organisations and multiple users to test denied accounting.view, denied accounting.post, denied members.view, disabled MFA, cross-tenant journal ID and non-member/denied assignee.
5. Test concurrent updates from two browsers with the same \`expectedVersion\`: one succeeds, one fails with refresh guidance.
6. Test empty note, excessive note, invalid UUID/fingerprint, duplicate case, and unapproved status \`resolved\`; the last must be rejected.
7. Confirm generated case fingerprint remains stable across reordered findings, while changed underlying evidence yields a new case. Do not auto-resolve old cases.
8. Open Accounting → Reconciliation exceptions; run a source audit, open a case, reload the page, load the saved queue, assign/review/comment, and confirm changes and operational status persist. The old session-only checkbox remains separate.
9. Confirm no audit button or review action posts, reverses, or auto-adjusts any accounting journal.

## Next batch

Batch 5: controlled resolution verification, independent reviewer sign-off when appropriate, evidence links and immutable action-history UI. No exception should be marked **resolved** merely because an operator checked a box or added a comment.

Batch 6: full local/non-CI tests, authenticated integration/E2E, staged schema/deployment and production acceptance after all security issues are addressed. **GitHub CI not run, per user instruction.**
