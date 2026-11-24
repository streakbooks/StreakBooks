# Files workspace — Batch 7: Smart Categories & Company Tags

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: **source changes committed only**. No TypeScript/build/lint/unit tests executed, no authenticated integration/RLS/browser tests, no GitHub CI/Actions, no migration applied, no PR/merge and no deployment.

## Delivered

1. **Document categories** — additive `document_attachments.document_category` with a fixed, database-checked set of unclassified, bill, invoice, receipt, statement, contract, tax, payroll, bank and other. Indexed for company-scoped queries. This does not alter existing accounting classifications.
2. **Reusable company tags** — new `document_tags` catalog with case-insensitive unique names and a strict limit of 50 characters, and `document_attachment_tags` many-to-many mappings with composite company FKs. Tags are private to each company. Up to 250 tags can be listed; larger installations need a paginated selector.
3. **Authorization and integrity** — RLS permits tag catalog read by company members and tag creation by users authorized to manage company files. File-to-tag associations require the underlying attachment's record-type manage permission; reads require its view permission. Cross-company attachment and tag IDs cannot be joined.
4. **Guarded deletion** — company-wide tags **may be deleted only when unused on every document**. A SECURITY DEFINER trigger checks all relationships, including those hidden by an individual user's RLS, to prevent a global deletion from stripping tags off restricted files. Users must unassign tags from documents they are authorized to manage before deletion.
5. **Deterministic, advisory classification** — `file-classification.ts` proposes a category based on linked record type, then filename keyword matches. The user must click Use suggestion or change the category selector. No AI claims, no automatic persistence, no third-party inference. It also recommends existing tags based on exact filename phrase matches; users explicitly check a tag to apply it.
6. **Live metadata manager** — `DocumentClassificationPanel` appears in Files > selected file details, with category selection, suggestion reason, tag search, assignment/removal, create-and-assign, explicit company-tag deletion confirmation and permission-aware controls.
7. **Filters** — the Files list adds category and company-tag filters, combined with existing folder/record/MIME/search filters. The backend applies filters before pagination. Tag filtering derives IDs from the company-scoped RLS-protected mapping and refuses incomplete results beyond 1000 matches rather than silently omitting records.
8. **Optimistic conflict check** — category update matches the previously loaded category to detect concurrent changes, and refreshes metadata on failure. Tag assignments are idempotent for repeated insert/delete operations.
9. **Audit attempt** — metadata changes send a best-effort audit event with company, attachment, action and tag/category identifiers. An audit transport outage does not roll back a completed metadata update; **do not claim immutable audit guarantees until tested and hardened**.
10. **Pure tests authored** — `file-classification.test.ts` exercises all named categories, keyword hints, record precedence, safe tag names, suggested existing tag phrases and non-mutating advice.

## Database migration and prerequisites

`supabase/migrations/20261106160000_files_document_classification_tags.sql` is additive. Before using, staging needs prior `document_attachments` storage/RLS migrations, `20261104054143_documents_review_workflow.sql` (composite attachment key), and the Batch 5 inbox migration if enabling email intake. No migration has been applied in this batch.

Review and test the following with two authenticated company fixtures:
- Company A cannot access tags or associations in Company B; a valid tag ID from B cannot be used on an attachment from A.
- A member with company-folder manage access but no purchasing record manage access cannot tag a restricted purchase attachment.
- Company tag creation requires the existing `company` attachment manage permission.
- Direct SQL updates to the mapping are denied (only INSERT/DELETE/SELECT granted); direct category values outside the allowed enum fail.
- Deleting an in-use tag is blocked by the trigger, even if its associations are invisible through the user's RLS; deleting an unused tag succeeds.
- Removing a tag assigned to another record never bypasses record access.
- Existing attachments receive the `unclassified` default; existing file download/storage paths and financial journal entries remain unchanged.

## Manual UI acceptance

1. Select a company file named `GST-2026.pdf`: show a tax category hint, but leave the stored category unclassified until Use suggestion is selected.
2. Select an attachment linked to a purchase bill with filename `receipt.pdf`: linked record precedence should suggest Supplier bill.
3. Save, refresh, switch folders and filter by category; counts/pagination should remain correct. Conflicting category changes must surface a reload/retry error.
4. Create FY2026 and GST tags, assign/unassign them and filter the Files list. The tag selector must keep company context during organisation switches.
5. Attempt to create case-insensitive duplicate names and invalid tag strings. Display a friendly validation error.
6. Try deleting an assigned tag. It must be rejected without removing it from any document. Unassign all references then delete unused tag with explicit confirmation.
7. Test read-only member, same-company role restricted by entity, cross-company file deep links, 250+ tags, 1000+ tagged documents, mobile, keyboard and rapid mutation interactions.
8. Confirm Document Review OCR/approval, Folder navigation, Email inbox and file bulk operations still work after migration.

## Local review without GitHub Actions

```powershell
cd D:\MyApp\StreakBooks
git fetch origin
git worktree list
# Create only if D:\MyApp\StreakBooks-Files-B7 does not already exist:
git worktree add --detach D:\MyApp\StreakBooks-Files-B7 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\StreakBooks-Files-B7
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/file-classification.test.ts src/lib/documents/file-workspace.test.ts src/lib/documents/ocr-model.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

Then apply reviewed migrations to isolated staging, run two-tenant RLS/security tests, perform browser smoke tests, and only consider a reviewed PR/merge when checks pass. Do not manually run GitHub Actions.

## Release notes and remaining work

- No extra provider credentials are required for deterministic classification and tags.
- This is **not** ML-based tagging, full-text content search or automatic statutory categorisation.
- Folder and file versioning, recycle bin/retention, performance at large tag volumes, and full security/recovery verification remain separate planned batches.
- Files Batches 1–7 are committed to the feature branch. Their commit count is **not** a percentage of production readiness.
