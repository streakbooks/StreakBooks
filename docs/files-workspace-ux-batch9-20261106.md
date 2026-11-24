# Files workspace — Batch 9: Recycle Bin, retention and durable Storage recovery

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: **source code committed**. No local TypeScript/lint/unit/build execution, authenticated browser acceptance, Supabase migration application, RLS integration test, GitHub Actions, PR/merge or deployment is verified.

## Source implementation

1. **Recycle Bin migration:** `supabase/migrations/20261106183000_files_recycle_retention_cleanup.sql` adds `deleted_at`, `deleted_by`, `purge_after` and `retention_hold` to existing `document_attachments`. No active file is backfilled as deleted.
2. **Non-destructive deletion:** Existing individual and bulk **Delete** actions now invoke the same signed-in delete endpoint, which moves files into Recycle Bin by updating the tombstone. Private Storage objects, prior versions, folders, tags, review records and linked-document references remain intact for authorized recovery.
3. **Active query exclusions:** Files listing, record attachments, details, rename, preview, download, duplicate preflight, OCR, category/tag operations, version history and folder moves exclude recycled documents. Database RLS also hides recycled documents from ordinary document-review, version-history and tag relationships.
4. **Recycle Bin UI:** `DocumentRecycleBin` is reached via **Files → Recycle Bin**, with company-scoped paginated file listing, original upload size, deletion time, purge-eligibility date, Restore, protection toggle, permission-aware Purge action and confirmation.
5. **Retention policy:** `document_retention_settings` stores configurable retention 7–3,650 days (default 30). The deadline is stamped by the database at time of recycling, so later policy changes **never shorten an existing file's retention deadline**. No automatic scheduled purge is enabled.
6. **Retention protection:** An authorized manager can set `retention_hold` on active or recycled files. Protected documents cannot be recycled or permanently purged until the hold is explicitly removed. Ready or approved company review documents cannot be moved into Recycle Bin until correctly returned to Needs review under review permissions.
7. **Database purge gate:** A separately authorized SECURITY DEFINER `purge_document_from_recycle_bin` requires authenticated company/document manage permissions, an actual recycled status, elapsed purge date and no protection hold. Direct Data API DELETE attempts are rejected by a separate trigger. Purging does not post accounting entries.
8. **Durable Storage cleanup queue:** A permanent-purge SQL transaction records every current and historical Storage path in `document_storage_cleanup_jobs` before deleting attachment metadata (which cascades related version, tag and review metadata). This queue persists even if Storage cleanup fails. It does not expose signed URLs to the browser.
9. **Cleanup verification:** A signed-in manager can Retry cleanup. After Storage removal, the `finish_document_storage_cleanup` RPC checks the actual `storage.objects` catalog; it refuses to report completion while queued objects still exist. An administrator warning remains when removal is unsuccessful.
10. **Pure tests authored:** `src/lib/documents/recycle-bin-rules.test.ts` checks 30-day default, retention bounds, expiry boundary, invalid dates, and protection holds. Database RLS/SQL tests are listed below but not executed.

## Critical limitations and safeguards

- **This migration is not applied or exercised against PostgreSQL.** A source review alone does not prove trigger order, owner privileges, Storage row policies or cross-table integrity.
- The durable queue covers **known Storage objects associated with a permanently purged attachment**. It does *not* automatically discover provisional orphaned objects created by interrupted normal uploads or unconfirmed version uploads; this remains separate administrator maintenance work. Do not advertise complete automatic orphan scavenging.
- Permanent deletion is manual only, after the retention deadline. No unattended cleanup worker, cron, or automatic legal-retention interpretation is provided.
- This is a basic **retention protection flag**, not certified WORM storage, statutory legal hold, country-specific record retention compliance or immutable regulatory archiving. A manager may remove the flag; regulated businesses must configure external retention controls and review local requirements.
- Version history, tags and reviews are preserved during a restore. Permanent purge intentionally cascades their metadata after waiting out retention, which is irreversible.
- Storage deletion and database deletion are not atomic. The queue ensures recovery is possible but cannot guarantee cleanup if a Storage object is inaccessible to the actor. Platform-admin recovery tooling is still required for permission-inaccessible orphans.
- Previously issued short-lived Storage signed URLs may remain valid until expiry; the active Files server methods no longer create new download links for recycled files. Direct Storage policies and legal-grade revocation need separate security review.
- Parent company/record cascade deletes may be blocked by the retention trigger. Validate company offboarding, sales/purchase record archival and period/ledger locks separately; do not override preservation controls to make cascades pass.
- Existing SQL versions migration and document-review/tag migrations must precede the new Recycle Bin migration. No production migrations are automatically applied.

## Database and RLS staging acceptance

1. A company-managed user moves a normal file to Recycle Bin. DB stamps actor, deletion timestamp and a future `purge_after` based on the selected company's settings. Existing versions and Storage objects still exist.
2. Verify active Files, record attachments, file signed-URL endpoints, category editor, OCR, version UI, direct document-review queries and tag operations no longer expose recycled files. The Recycle Bin listing shows it only to members already entitled to view the underlying record.
3. Restore from Recycle Bin as an authorized record manager; verify the same file ID, links, original folder, historical versions, tags and review status reappear unchanged.
4. Cross-company and cross-entity permission tests: users from company B cannot list/restore/protect/purge a company A attachment; read-only members cannot mutate. Direct DELETE outside purge RPC must fail.
5. Set retention to 7, 30, 365, 3650 days; try invalid values, changing company, and updating policy after existing files are recycled. Already-stamped deadlines must remain unchanged.
6. Protect an active file, then attempt recycling; the trigger must block it. Protect a recycled file; permanent purge must be blocked after the date expires until authorized removal.
7. For a ready/approved reviewed document, attempt recycling and direct review changes while recycled. Proper approval/authorization controls must apply.
8. Reject permanent purge before deadline, on an active file, with a protection hold, and via direct Data API. After expiry, require document + company manage rights and an explicit UI confirmation.
9. Create an attachment with three versions, permanently purge after retention eligibility, then verify the cleanup queue recorded **all three object paths** before metadata disappeared. Check no version/table evidence survives outside documented audit tables.
10. Simulate a Storage removal error. The cleanup queue must remain pending; retry must not mark success while `storage.objects` still contains an object. After successful deletion, `completed_at` must be recorded once.
11. Test asynchronous network disconnects mid-purge, repeated/duplicate purge calls, deleted parent company, owner/role changes, invalid paths, and Storage DELETE permission changes.
12. Verify row-level and company-bound checks with *two separate real authenticated sessions*, not just UI state. Test desktop, narrow mobile, keyboard, and confirmation focus.

## Local PowerShell verification — no manual GitHub Actions

```powershell
cd D:\MyApp\StreakBooks
git fetch origin
git worktree list
# Create only if the destination does not already exist:
git worktree add --detach D:\MyApp\StreakBooks-Files-B9 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\StreakBooks-Files-B9
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/recycle-bin-rules.test.ts src/lib/documents/file-versions.test.ts src/lib/documents/file-classification.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

Follow with isolated staging migration execution after backup, SQL and RLS checks, authenticated browser fixtures and a complete regression suite. Reconcile against the rapidly changing `main` and merge only after passing verification. No GitHub Actions workflow was manually run.

## Next batch

**Batch 10** — final security hardening, large-folder/tag performance, mobile UI and regression integration. Production readiness is a separate verification gate; 9/10 committed batches do not imply 90% verified production readiness.
