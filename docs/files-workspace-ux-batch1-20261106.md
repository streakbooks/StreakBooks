# Files workspace — batch 1 UX and reliability (2026-11-06)

## Scope

- The existing Files route, document attachments and folder services are retained. No bookkeeping, journal, Storage object or SQL migration writes are introduced.
- A company-scoped, RLS-preserving file detail endpoint supports direct `/files?file=<uuid>` links even when the file is not on the current list page. Reference lookups remain tenant-scoped and inherit their table RLS.
- Files may be renamed through a keyboard-accessible inline form. Only the metadata filename changes; the immutable private Storage object key, linked accounting record and file bytes remain untouched. The server checks company membership, entity-specific manage permission, a stable extension, printable/safe filename and optimistic current-name match; rename attempts that succeed are audited through the existing audit RPC.
- Folder rename no longer relies on `window.prompt`. The form has Save/Cancel actions, pending state and the existing server-side validation.
- Bulk moves skip selected files already in the target folder. The mutation handles failures per file, reports successful and unsuccessful counts and leaves failures selected for another attempt. No claim of transaction-level atomicity is made.
- Destination selectors display full ancestor paths, avoiding ambiguity between same-named nested folders.
- File listing can reset filters, displays the filtered result count and does not reuse previous-company paginated results during a company switch.
- Upload batches are limited to 25 files with existing per-file validation. An interrupted sequential upload reports the number completed before the error, rather than implying that the entire batch failed. Newly successful uploads return the user to page one.
- Selected-file details also expose Rename and Delete, including for deep-linked files.

## Permissions and limits

The new file detail reader relies on existing document-attachment RLS, company membership and company-scoped reference lookups; the new rename writer additionally checks entity-specific manage permission and the update's RLS. No service role is used.

Renaming does **not** change the physical object's Storage path. The extension cannot be changed. The rename audit uses the existing `record_audit_event` RPC; verify its invocation in a real authenticated session.

Folder moves and uploads are still **sequential and non-atomic**. Partial success is explicitly shown; moved items cannot be automatically rolled back. The batch does not implement a document inbox email address, OCR extraction, retention policies, full-text search, file version history or storage quota monitoring.

## Verification status

GitHub CI and Actions were intentionally not requested or run. This batch was committed on a feature branch, not merged into `main`. New Vitest cases are authored for filename rules and full folder destination labels, but no repository Vitest, TypeScript, ESLint, build or browser suite was executed in this environment.

## Manual acceptance checklist

1. From `D:\MyApp\LinkBooks`, keep uncommitted Cursor changes safe before switching branches. Run `git status --short` and, when appropriate, `git stash push -u -m "Save Cursor work before Files review"`.
2. Run `git fetch origin`, `git switch feature/files-workspace-ux-20261106`, and `git pull --ff-only origin feature/files-workspace-ux-20261106`.
3. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test -- src/lib/documents/file-workspace.test.ts src/lib/documents/folder-tree.test.ts`, and `npm.cmd run build` (local only; no CI).
4. Open Files for a permitted company. Test a file detail link to an item on a different page, then open it with another company and a read-only account. The unauthorized file must not be shown.
5. Rename a document with the same extension; verify the new display name, download name, audit record, linked document and unchanged Storage object key. Test extension changes, invalid separators and stale concurrent filenames.
6. Rename, create, move and delete folders (including nested duplicate names, descendant-loop rejection, empty-folder deletion rules and concurrent changes).
7. Bulk move files where some are already in the destination and where one file loses permission midway. Confirm success/failure messaging and which failed files remain selected.
8. Upload 1, 25 and 26 files; test a bad MIME or oversized file, a failed upload after an earlier success and the refreshed first page.
9. Check keyboard/focus behavior, responsive widths, loading and error messages, downloads, previews, delete confirmation and independent folder navigation.
10. Verify staging RLS for two tenants and the live migrations `20261025200100_company_documents_storage.sql` and `20261029160000_document_folders.sql` before any deployment.

## Release gate

Do not merge/deploy until local checks and authenticated multi-tenant acceptance are verified, and any concurrency conflicts with advanced `main` are reconciled. No GitHub CI is required or authorized by this batch.
