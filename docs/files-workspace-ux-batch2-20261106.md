# Files workspace — Batch 2: discovery, folder scoping and safe navigation

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: source changes committed; non-CI local checks and authenticated staging QA not executed. Do not merge or deploy without verification.

## Delivery

1. **Nested folder search.** An optional checkbox in the selected folder includes its descendants when listing files. The API obtains folder IDs from the signed-in user's own company via the existing RLS-protected `document_folders` table; it never accepts a client-supplied list of IDs.
2. **Scope integrity.** A bounded and exact-count-checked folder list is required. If a folder tree is incomplete, exceeds 1,000 rows or the requested folder cannot be found, the server refuses the nested query rather than silently returning partial results. A pure breadth-first helper deduplicates cycles.
3. **File-format filtering.** Fixed server-side MIME allowlists cover PDF, images, spreadsheet/CSV, Word and text. Unknown values revert to all formats; no free-form SQL column or expression input is accepted. This is a metadata filter, not content inspection: files without a recognized MIME value remain in All formats.
4. **Folder finder.** Search folders by name or full ancestor path; up to 20 matches are displayed with unambiguous full labels.
5. **Interaction.** UI filters reset pagination and selection. File lists no longer temporarily reuse an earlier query while navigating between filters/folders. Matching-file totals and folder-specific empty states explain active scope.
6. **Consistent deletion.** Delete-empty-folder confirmation now uses the application's accessible AlertDialog rather than a browser-native confirm.

## Architectural boundaries

- All file queries are company-scoped, use authenticated middleware and retain `document_attachments` row-level security for record-specific visibility.
- Nested folder scope is resolved with a 1,000-folder cap. A company exceeding that limit needs a paginated/recursive database-side search design before the feature can support larger trees.
- No storage objects, accounting journals, SQL migrations, permissions or RLS policies were modified by this batch.
- The search remains filename/metadata based; it is **not full-text OCR/document indexing**.
- Email intake via HostGator or another provider is not implemented here.

## New tests (authored, not executed)

- `src/lib/documents/folder-tree.test.ts`: descendant inclusion, sibling exclusion, unknown roots, malformed cycles.
- `src/lib/documents/file-workspace.test.ts`: format allowlist, parsing of unknown values, PDF/image/CSV/Word/text formats.

## Run non-CI local checks in a clean second worktree

```powershell
cd D:\MyApp\StreakBooks
git fetch origin
git worktree add -b review/files-ux D:\MyApp\StreakBooks-Files origin/feature/files-workspace-ux-20261106
cd D:\MyApp\StreakBooks-Files
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/file-workspace.test.ts src/lib/documents/folder-tree.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

If the review worktree/branch already exists, reuse it and fetch/pull the feature branch instead of running `git worktree add` twice.

## Manual acceptance gate

1. Test All formats, PDF, Images, Spreadsheets & CSV, Word, Text, plus file record-type filters.
2. Search a parent folder with nested items; compare the exact count/list with the checkbox off and on. Check sibling folders and another company's folders never appear.
3. Test 0, 1, 999, 1000 and more than 1000 folder rows (including configured API row limits) and a stale/invalid folder ID. No partial search should masquerade as complete.
4. Test filename search and file-format combination with pagination, sorting, clear filters and repeated folder navigation.
5. Test folder finder for duplicate folder names, deep nesting, 20+ matches, malformed cycles and keyboard navigation.
6. Try deleting a nonempty folder (must fail safely) and an empty folder (with confirmation/cancel).
7. Verify read-only, restricted-entity and cross-company identities, plus signed-file previews, downloads and expected audit events from Batch 1.
8. Test mobile widths, screen readers and error states.
9. Refresh against latest concurrent `main` and check conflicting file modifications before merging.

GitHub CI and Actions were intentionally **not** invoked. No production deployment was performed.
