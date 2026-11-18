# Files workspace — Batch 8: Immutable Document Version History

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: source changes committed on feature branch only. No local TypeScript/lint/unit/build execution, no staging RLS/database browser tests, no GitHub Actions, PR/merge or production deployment.

## Source implementation

1. **Version migration:** `supabase/migrations/20261106170000_document_attachment_versions.sql` adds a `current_version` pointer (default 1) and the `document_attachment_versions` immutable history table with a unique (company, attachment, version) key, company-scoped parent FK and Storage-path uniqueness. Historical data is not backfilled at migration time; an existing file's original content is captured as version 1 when its first replacement is committed.
2. **Immutable history:** authenticated users receive SELECT only on version history, filtered through the parent document's current record-specific view permission. There are no client INSERT, UPDATE or DELETE grants for version rows. Deleting the parent cascades metadata history (but not Storage objects; see cleanup below).
3. **Atomic current-version switch:** security-definer `commit_document_attachment_version` performs an explicit signed-in user check, validates current company/record manage permission, acquires a row lock, checks optimistic `expected_version`, confirms the new object exists in the private `company-documents` bucket and was uploaded by the requesting user, verifies byte count and MIME metadata, enforces the current file extension, inserts immutable snapshots and advances the current pointer in one database transaction.
4. **Direct-write protection:** a database trigger blocks arbitrary updates to file bytes, Storage metadata, or version counter outside the authorized version-commit function. File rename, folder move and category/tag editing remain separate metadata workflows.
5. **Approval protection:** a company-level review document must be in `needs_review` before replacement. Users cannot silently replace evidence already `ready`, `approved`, `rejected` or `archived`. Returning an approved document to `needs_review` still requires the document-review lifecycle's own permissions.
6. **Version endpoints:** `src/lib/documents/file-versions.functions.ts` provides permission-checked history listing, registration and short-lived signed downloads of any historical/current version. Company/attachment scope is enforced on every request. History must be contiguous and at most 50 versions; incomplete history fails closed rather than showing a misleading partial timeline.
7. **Browser upload:** `uploadDocumentVersion` uses the existing authenticated private Storage client and a new random object path with `upsert: false`, then registers it. No old version object is overwritten. The original file extension and logical document link remain intact.
8. **File-details UX:** `DocumentVersionHistory` lists version number, created timestamp, file size, Current marker, download per version and a replacement upload action with explicit confirmation. It appears on eligible private Storage-backed files; legacy inline/base64 files are not migrated or replaced by this feature.
9. **Deletion cleanup:** the existing delete endpoint now reads and validates the complete historical path list before deleting parent metadata. After deletion it requests Storage removal of the current object and all historical objects, reporting whether administrator cleanup is needed. Storage and Postgres operations remain non-atomic.
10. **Pure tests authored:** `src/lib/documents/file-versions.test.ts` verifies same-extension replacements, supported type/size, maximum version count, history continuity and rejection of malformed snapshots.

## Security & integrity requirements

- The immutable history table requires the preceding company-document permissions and the `document_attachments(company_id,id)` composite key from the document review migration. Apply migrations in order to isolated staging only after review and backup.
- No public Storage bucket, service-role access, reusable public file link or client-side version row mutation is added.
- The RPC is protected by the *server-side* Storage owner ID and authenticated user's company/record manage rights, with an expected current version to reject concurrent replacements. Both authorized UI actions and direct Data API/RPC requests must respect the database checks.
- Existing accounting transactions and journals remain unchanged; a file replacement preserves old versions for evidence, but it must not be represented as accounting approval.
- Historical download URLs expire after 120 seconds; anyone with the signed URL can use it during that short window. Do not expose it in public channels or logs.
- Version deletion is not supported independently; the module intentionally retains versions until the parent file is permanently deleted under the existing permission controls.
- To restore old content, the current workflow is to **download an older version and upload it as a new version**. A one-click server-side restore flow is not part of this batch.
- A network failure could occur after upload but before the registration response. The browser does not automatically delete the uploaded object on an ambiguous failure, because the RPC may have committed. The user must refresh history before retrying; unlinked objects require separate orphan cleanup (planned for Batch 9).
- The maximum is **50 versions per document**, bounded by 20 MB per individual file. The limit can be revisited after retention/capacity policy design.

## Manual acceptance checklist

1. With migration missing, older file actions should surface actionable migration errors rather than pretending version history exists.
2. For a new private PDF: history displays v1. Upload another valid PDF, confirm explicit dialog, expect v2 current, v1 downloadable, and existing internal file link showing v2.
3. Rename the file metadata, then download v1 and v2. Confirm older history remains unchanged and current display filename reflects the logical rename.
4. Reject extension changes, MIME mismatches, empty files, more than 20 MB, and invalid Storage paths. Reject v51.
5. Attempt concurrent v2 uploads from two sessions using the same expected v1. Exactly one should advance current version; the other fails with a stale-version message and no version gaps.
6. With a document-review item marked ready/approved/rejected/archived, attempt replacement; database must block it until the authorized reviewer returns it to needs_review.
7. Verify RLS with two companies and restricted sales/purchases/accounting record permissions. Unauthorized users cannot see history or create/download versions.
8. Try direct Data API UPDATE of `document_attachments.storage_path` and `current_version`, and direct UPDATE/DELETE/INSERT on `document_attachment_versions`; each must fail.
9. Delete an attachment with v1-v3, verify its metadata history cascades and the endpoint attempts removing all three private Storage objects. Simulate a failed Storage removal and verify the administrator-cleanup warning.
10. Simulate a lost registration response and confirm the UI instructs Refresh rather than deleting a possibly committed current object; confirm orphan recovery is separately tracked.
11. Regress attachment downloads and previews, company folder moves, tag category changes, original document-review status and existing email-to-Inbox imports.
12. Test mobile/tablet widths, keyboard and accessible confirmation, permission changes during upload and network timeouts.

## Local verification — no GitHub Actions

```powershell
cd D:\MyApp\LinkBooks
git fetch origin
git worktree list
# Only create if the destination does not already exist:
git worktree add --detach D:\MyApp\LinkBooks-Files-B8 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\LinkBooks-Files-B8
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/file-versions.test.ts src/lib/documents/file-classification.test.ts src/lib/documents/file-workspace.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

Then run isolated database migrations, two-tenant RLS tests and authenticated browser fixtures. Refresh/rebase the feature branch against latest `main` and validate all previous Files workflows before PR/merge. No GitHub Actions/CI workflow was manually started.

## Release status

- Code committed: **Batch 8 of 10 planned**.
- Unit tests: **authored but not executed**.
- Staging/migrations: **not applied or verified**.
- GitHub PR/main merge: **not performed**.
- Production deployment: **not verified**.
- Next: **Batch 9 — Recycle Bin, retention controls and orphan Storage cleanup**.
