# StreakBooks Files — Batch 10: security, scale, mobile UX and release gates

Date: 2026-11-06
Repository: `streakbooks/StreakBooks`
Feature branch: `feature/files-workspace-ux-20261106`
Scope: Final **planned code-development batch** (10/10). **Production readiness is NOT verified.** No GitHub Actions/CI was manually triggered.

## Completed and committed source updates

### Scalable tag filtering
- `listCompanyFiles` now applies a PostgreSQL/PostgREST `!inner` relationship filter against `document_attachment_tags`, filtering by `tag_match.tag_id` while preserving the existing company ID, attachment RLS, other search filters, ordering and server-side pagination.
- Removed the earlier preliminary query that loaded up to 1,000 matching attachment UUIDs and passed them into `.in("id", ...)`. This avoids oversized HTTP queries and a false 1,000-tagged-file ceiling.
- The join assumes the Batch 7 composite FK migration is present and the PostgREST schema cache recognizes `document_attachment_tags`. Test for schema-cache/PGRST200 errors in staging; refreshing the schema cache may be required after applying migrations.
- `fileListProjection` is a pure selector used by the endpoint and covered by authored unit tests.

### Indexed folder paths
- `indexFolderPaths` builds a memoized, cycle-safe path index for a company's folders. Search and destination labels reuse the index rather than calling an ancestor lookup per folder on every render.
- The Files screen caches the index with React `useMemo`. Long nested paths and malformed cycles have additional pure test cases.
- The prior 1,000-folder server bound still applies to recursive-folder browsing. Eliminating that bound requires a separately verified recursive PostgreSQL query/RPC and is **not** promised in this batch.

### Safer pagination and recovery
- `safeFilePage` limits untrusted page numbers to a bounded offset, guarding against huge or non-finite requests.
- Company Files, Recycle Bin, and Storage cleanup listing use this shared page validator.
- `lastFilePage` clamps the active Files/Recycle Bin page when filters, restores, or deletions shrink the available results.
- Cleanup jobs now use pages of 25 with deterministic order and a total count instead of refusing the entire list once the backlog exceeds 100. The Recycle Bin UI adds Previous/Next controls and automatically returns to the last populated page after cleanup.
- Authenticated RLS/company checks remain in all existing endpoints. The cleanup API still only returns job IDs, timestamps, object counts and total — not private paths or signed URLs.

### Mobile/accessibility improvements
- File tables have an explicit accessible region label and a minimum readable width. Existing scrollable Table infrastructure allows horizontal navigation on narrow screens.
- An explicit small-screen hint explains horizontal scrolling.
- File detail/header and pagination controls wrap on narrower widths.
- The Recycle Bin pagination layout also wraps; no functionality was hidden on mobile.
- The user still needs actual browser/device accessibility tests (keyboard, focus, VoiceOver/NVDA, viewport widths, touch and screen-reader table semantics).

## Focused unit tests authored — NOT executed
- `src/lib/documents/file-workspace.test.ts`: tag-join projection, invalid/oversized page indexes, last-page calculations.
- `src/lib/documents/folder-tree.test.ts`: indexed full paths, distinct named folders, malformed cycles and missing parents.
- Existing tests authored in prior batches remain relevant and require execution.

## Required local release verification (NO GitHub Actions)

```powershell
cd D:\MyApp\StreakBooks
git fetch origin
git worktree list
# Create only if the destination is not already present:
git worktree add --detach D:\MyApp\StreakBooks-Files-B10 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\StreakBooks-Files-B10
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents
npm.cmd run build
npm.cmd run check:ui
npm.cmd run check:bundle
```

For authenticated browser QA, start the local server in that isolated checkout on a free port and use the project's browser fixture instructions. Do not launch GitHub CI manually. Preserve any existing worktree, local changes and Cursor processes.

## Mandatory staging/database safety acceptance

1. **Migration order:** apply and inspect existing company-document/private Storage, document folder, document review, email inbox (Batch 5), categories and tags (Batch 7), immutable versions (Batch 8), and Recycle Bin/retention (Batch 9) in order to an isolated, backed-up staging database. All migrations are still unapplied/unverified as of this source report.
2. **Two real tenant contexts:** create authorized and unauthorized users in two companies, including sales-only, purchases-only, read-only and company-manager roles. Test list/download/preview, folder moves, tags, review edits, version uploads/downloads, recycle/restore/purge and Storage cleanup.
3. **PostgREST tag join:** verify filtering with zero matches, 1 match, at least 1,001 tagged files, multiple categories and nested folders. Confirm the page count and stable ordering; compare against direct SQL results under the same role.
4. **Search and tree scale:** verify folder labels with deep nesting, duplicate names, cycles injected into a test fixture, 1,000 folders, search filtering, selection reset and narrow mobile widths. Explicitly test the documented >1,000 recursive folder limit.
5. **Retention and recovery:** verify the 30-day default, configured bounds, retention holds, protected/approved documents, early purge refusal, expired purge, SQL role gates, cleanup queue persistence, real Storage removal verification and recovery after failed deletion.
6. **Version integrity:** test original v1 and v2+ historical downloads, concurrent attempts on the same expected version, failed Storage uploads, SQL guard behavior and the 50-version cap.
7. **External providers:** Email-to-Inbox and OCR require properly configured production/staging provider credentials, distinct receiving domain and privacy review. Validate actual PDF invoice intake, OCR opt-in, human approval and no automatic ledger posting.
8. **Load and UI:** test 100+ cleanup jobs with pagination, long filenames, 25-file bulk selection, rapid company switching, failed/partial operations, 320px/375px/768px/desktop viewports, keyboard accessibility, and error toast recovery.
9. **Regression:** run all local tests and relevant browser fixture sets; ensure no changes to ledger postings, approvals, company isolation, bank reconciliation and period locks.
10. **Merge and release:** refresh the feature branch against the up-to-date authoritative `main` (which has advanced by hundreds of commits), inspect direct file overlap, resolve structural/API differences, run all checks again, and only then request reviewed PR/merge. Verify migration compatibility, production backup, monitoring and rollback before any deployment.

## Known limitations / blockers

- **Verification gap:** source-level checks and authored tests do not replace TypeScript, ESLint, Vitest, SQL, RLS, browser or load-test execution. This batch is *coded*, not verified ready.
- **External configuration:** Azure OCR and Resend Receiving cannot operate until an administrator configures secure server credentials and a receiving domain. HostGator forwarding remains a manual setup task.
- **Retention/legal:** this is not legal-grade WORM or jurisdiction-specific statutory retention. No scheduled unattended purge and no global orphan scanning.
- **Scale:** recursive folder searching remains bounded to 1,000 folders; tag joins and cleanup-list pagination remove specific limits but have not been profiled with real company data.
- **Data safety:** storage and database changes cannot be made atomically. The durable cleanup queue helps after explicit purge but cannot discover every provisional orphan from lost upload replies.
- **Branch/release:** no PR or merge to main, no applied migrations, no authenticated staging QA and no production deployment are claimed.

## Progress basis

Coded batches: **10/10** of the proposed Files scope.
Automated tests **executed and verified here: 0**.
GitHub PR/merge **verified here: 0**.
Production deployment **verified here: 0**.

The remaining work is a separate **Release Verification & Integration phase**, not an 11th development batch until separately scoped. Do not represent 100% source batch coding as 100% launch readiness.
