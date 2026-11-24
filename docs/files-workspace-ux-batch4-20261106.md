# Files workspace — Batch 4: advisory duplicate review on uploads

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: committed on a feature branch only. No GitHub Actions/CI, local TypeScript/lint/unit/build, authenticated browser testing, merge or deployment has been run.

## Scope

- Before uploading through the Files page picker or drag-and-drop area, validate the existing 20 MB MIME/extension limit and 25-file batch limit.
- Issue one authenticated, company-scoped advisory preflight request for 1–25 file-name/byte-size pairs. Existing-file matches use the ordinary user's Supabase session, document-attachment RLS and exact company ID. Only a boolean flag per requested file is returned. Files from inaccessible record types must not be surfaced in this response.
- Repeated file-name/byte-size pairs within the same selection are flagged client-side (case-insensitive, Unicode-normalised). Existing-file flags and repeated-selection flags are combined in original picker order.
- If no possible duplicate is found, uploads proceed as before. If one or more matches exist, show a review dialog listing every selected file and its flag, with **Cancel**, **Upload unflagged only** and **Upload all anyway** actions. Neither existing nor incoming files are silently removed.
- If preflight fails, do not silently auto-upload: show a separate warning that existing files could not be checked. The operator may cancel, explicitly upload everything, or upload only unflagged local selections when such files exist.
- A file name plus size is an **advisory metadata match, not byte-for-byte verification**. Different names with identical content and inaccessible existing records are not detected. This batch does not hash file contents or create a database digest index.
- Lock the selected organisation and target folder in the upload mutation's input at selection time. Discard review state on company switch, and invalidate the correct company's file list following an upload. Avoid reusing a review from a different company.

## Security and privacy

- `checkPossibleFileDuplicates` is an authenticated server endpoint. It reads `document_attachments` via the existing user-scoped client, with `company_id`, `size_bytes`, escaped `ilike` filename matching and a single-row limit.
- The endpoint does not return file IDs, document names, signed Storage URLs, object paths or content. Existing attachment RLS must be tested with restricted records and two tenants.
- This is **not** a malicious-file scanner, content hash verifier, antivirus check or a concurrency-proof duplicate constraint. A file can become a duplicate between the preflight and upload.
- Backend upload authorization remains the existing Storage and metadata-registration RLS; never treat the frontend check as an authorization decision.
- No database migrations, new tables, service-role operations, external sharing permissions or accounting postings were introduced.

## Tests added (authored, not executed)

- `src/lib/documents/file-workspace.test.ts`: repeated names with case/whitespace differences, distinct sizes, review keep/skip decisions, combination and mismatched lengths of existing versus in-batch flags.
- The endpoint itself still needs authenticated integration/RLS tests on two organizations and multiple record permissions.

## Manual acceptance checklist

1. Upload a unique valid file; confirm it uploads with no review dialog.
2. Select two files with the same name and byte size. Confirm only the second is locally flagged; test Cancel, Upload unflagged only, and Upload all anyway.
3. Upload a new file matching an existing **visible** attachment by name and size. Confirm the warning and both upload choices. Test a same-name file with a different byte size.
4. Test a file belonging to an **inaccessible** record: it must not be disclosed or flagged by the server solely because it exists.
5. Simulate preflight error or offline state: verify the warning and explicit continuation, not silent upload.
6. Switch companies or folders during preflight/review; verify the request source company and folder are preserved or the review is discarded as appropriate, with no cross-tenant leakage.
7. Attempt 0, 1, 25, and 26 files, an oversized file, an unsupported MIME/extension and two files with identical names but different contents. Explain metadata false positives.
8. Check browser keyboard navigation, screen reader text, drag-and-drop while scanning, mobile dialog layout, partial upload failure and list refresh.
9. Run local TypeScript, lint, unit and build checks, then authenticated two-tenant browser tests. Reconcile the feature branch with advancing `main` before merging.

## Local review, without disturbing Cursor

```powershell
cd D:\MyApp\StreakBooks
git fetch origin
git worktree list
# Create a NEW review worktree only if the destination is not already present:
git worktree add --detach D:\MyApp\StreakBooks-Files-B4 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\StreakBooks-Files-B4
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/file-workspace.test.ts src/lib/documents/file-batch.test.ts src/lib/documents/folder-tree.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

No GitHub CI/Actions were intentionally invoked. No claim of deployment or production readiness is made.
