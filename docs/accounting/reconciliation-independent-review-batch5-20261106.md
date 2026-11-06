# LinkBooks Accounting — Reconciliation Independent Review, Evidence & History (Batch 5 / 6)

## Implementation

Batch 5 adds **independent review of an investigation**, not verified accounting remediation. No action posts, reverses, clears or adjusts a journal, and a reviewed exception can still be financially unresolved.

### Files
- \`supabase/migrations/20261106234500_reconciliation_review_signoff.sql\`: additive migration, dependent on Batch 4 migration \`20261106233000_reconciliation_review_cases.sql\`. Extends status to \`ready_for_review\` and \`reviewed\`, adds HTTPS evidence URL, submitted/reviewed actor timestamps and stage-consistency constraints; extends event actions; adds stage-transition trigger protecting old Batch-4 write RPC; creates versioned \`progress_reconciliation_review_case\` RPC.
- \`src/lib/accounting/reconciliation-review-signoff.functions.ts\`: permissioned, bounded history read and versioned progression; server checks accounting.view and accounting.post before calling the SQL RPC.
- \`src/lib/accounting/reconciliation-review-signoff.functions.test.ts\`: 16 Vitest mock tests for read isolation, history bounds, rejected invalid states/evidence, stale/unsafe version inputs, permissions, and database failures.
- \`src/components/accounting/ReconciliationReviewSignoffPanel.tsx\`: evidence and review actions, independent sign-off and on-demand history display.
- \`src/components/accounting/PersistentReconciliationReviews.tsx\`: integration and gated old operational actions.
- \`src/lib/accounting/reconciliation-review.ts\`: typed new statuses, stage metadata and event history.
- \`src/lib/accounting/reconciliation-review.functions.ts\`: read new case metadata on listing and exact lookup.

## Explicit lifecycle

1. **Open / In review / Blocked:** operational review states (existing Batch 4).
2. **Attach evidence:** supply a valid HTTPS URL (max 500 characters) and reason. URL changes are versioned and event-logged.
3. **Submit:** case must be \`in_review\`, evidence attached, eligible *active*, different assigned reviewer, explanatory note >=10 characters. Status becomes \`ready_for_review\`.
4. **Independent sign-off:** status \`ready_for_review\`; only the authenticated, effectively permitted *assigned* reviewer can sign off; that reviewer cannot be the case creator or submitter. Written conclusion >=10 characters. Status becomes \`reviewed\`.
5. **Reopen:** submitted or reviewed case, written reason >=10 characters. Resets previous submission, sign-off and evidence. A new independent review requires new evidence and resubmission.

**Never infer:** \`reviewed\` != \`resolved\`, \`reviewed\` != source cleared, and \`reviewed\` != all audit modules passed.

A source audit may still report \`exceptions\`, \`partial\`, \`unavailable\` or \`not_run\` after a review sign-off. The case status does not rewrite any source audit result.

## Security

- RLS read access remains authenticated + MFA + is_company_member + accounting.view, with explicit SELECT-only grants. No direct INSERT/UPDATE/DELETE grant to authenticated or anon.
- Both versioned RPCs independently enforce authenticated identity, MFA, membership, accounting.view and accounting.post. The new RPC is SECURITY DEFINER with empty search_path and fully scoped source tables.
- The new stage-transition trigger also protects writes through **the old Batch-4 RPC**: submitted/reviewed cases cannot be reassigned or silently changed back to operational states without clearing sign-off/evidence. The Batch-4 RPC cannot create the \`reviewed\` stage.
- Progression locks the case \`SELECT ... FOR UPDATE\` and compares \`expectedVersion\` before any changes. History append is in the same SQL transaction.
- Source and journal evidence fields are immutable in the case table; no false attestation can be attached to a different finding.
- Evidence URLs require \`https://\` and deny control/whitespace characters; UI uses \`rel="noopener noreferrer nofollow"\` for external links.
- History query validates the case's company before reading events and uses company + case scoping. Displays latest 100 events and \`hasMore\` if truncated, never claiming full history beyond the cap.
- Assignee eligibility checked when assigned in Batch 4; submit rechecks that reviewer is active; sign-off enforces actor's current accounting permissions.

## Preconditions and verification

**Do not assume the migration was deployed:** Batch 4 and Batch 5 migrations are committed only; neither was applied to Supabase by this branch. Applying the Batch 5 migration without Batch 4 would fail.

**Mandatory preproduction acceptance:**
1. Run full local \`npm.cmd run typecheck\`, \`npm.cmd run lint\`, \`npm.cmd run test\`, \`npm.cmd run build\`. These are local non-GitHub CI commands.
2. Apply Batch 4 then Batch 5 migrations to an isolated staging clone first. Validate SQL parses and RLS/GRANT/RPC privilege matrices for two separate organisations. Confirm all existing case rows continue to satisfy new constraints.
3. Verify \`auth.uid()\`, AAL2 MFA, company membership and accounting.view/accounting.post denied paths, directly invoking both RPCs with an authenticated test token.
4. Verify signoff by original creator fails, signoff by submitter fails, signoff by unassigned reviewer fails, signoff after permission revocation fails, signoff by independent assigned reviewer succeeds.
5. Test stale version with two sessions: only one update succeeds; the other sees a refresh/concurrency error. Do not bypass optimistic locking.
6. Test old Batch-4 status/assignment RPC against a submitted/reviewed case: **old RPC must fail closed**.
7. Verify invalid evidence URL, cross-tenant case ID, missing evidence, no eligible reviewer, incomplete notes and direct client DML all fail safely.
8. Test Open → In review → Attach evidence → Submit → Independent signoff → Reopen; verify events are present in the history list (including actor/reason/old-new status), and review signoff does not alter source journal or exception counts.
9. Confirm long histories >100 events advertise partial coverage rather than presenting an exhaustive event timeline.
10. Review external evidence links for security/retention/privacy; the link is a reference, not a copied immutable document. Private external documents may require their own authentication.
11. Inspect Supabase Security Advisor after applying staging migrations, and apply to production only after tests pass. Vercel deployment, application tests and release checks are separate from GitHub PR merge.

### Next: Batch 6

Finish non-GitHub CI repository tests, authenticated/RLS staging integration, source-audit rerun verification, full browser QA, and production deployment acceptance. **Do not trigger GitHub Actions CI**, per user instruction.
