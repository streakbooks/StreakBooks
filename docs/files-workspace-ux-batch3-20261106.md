# Files workspace — Batch 3: safe bulk actions and authenticated file links

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: GitHub source changes committed only; local TypeScript/build/Vitest, authenticated RLS and browser acceptance are not verified. GitHub CI/Actions must remain disabled.

## Features delivered

- **Permanently delete selected files** through an explicit, application-native confirmation dialog. Selection is limited to manageable files on the current visible page (max 25). Each deletion calls the existing authenticated company-scoped, entity-RLS-protected delete endpoint. The dialog clearly warns that attached files are detached from their accounting records and that the action is irreversible.
- **Shared bounded sequential batch runner** prevents empty, duplicate or oversized inputs and attempts each item exactly once, continuing after a failure. It records completed IDs, failed IDs, first error and post-operation warnings independently.
- **Retry action** for failed moves and failed deletions persists through page shifts after a partially successful operation. Delete retries require another confirmation. Retry state clears on company switch.
- **Copy file link** makes `https://<app-host>/files?file=<uuid>` for an existing file. This is not a public share link, never includes the short-lived signed Supabase Storage URL, and does not bypass login or record permissions.
- **Storage cleanup visibility.** The existing delete endpoint previously ignored Storage object removal errors after deleting metadata. It now reports `storageCleanup: "complete" | "requires_admin"`; the UI distinguishes a fully cleaned deletion from one requiring administrator cleanup. A failed Storage cleanup is **not** treated as a retryable attachment deletion because the metadata row was already deleted. Existing audit logging is attempted with cleanup status and path for administrator investigation.

## Safety and design constraints

- No SQL migration, schema change, policy change, external sharing mechanism, email integration or automatic accounting posting changes.
- The delete process is **not atomic across Postgres and Storage**. A Storage removal failure leaves an orphan object requiring administrative cleanup. No automated cleanup queue, recovery job or retention/approval hold is implemented in this batch. Audit RPC failures may still prevent the cleanup event from being recorded; audit persistence requires staging verification.
- A user must possess the existing entity-specific manage permission; unauthorized attempts remain blocked by the database's row-level security. UI-only permission checks are not relied upon for security.
- Bulk operations are explicitly limited to one visible results page and 25 distinct IDs per attempt, not all pages or all company files.
- Copying an internal link does not grant access. The recipient must have the existing company and underlying record permissions.
- No GitHub CI or Actions invoked; all commits use `[skip ci]`. The branch is **not merged or deployed**.

## Focused tests authored, not yet executed

`src/lib/documents/file-batch.test.ts` covers sequential ordering, input bounds, duplicate selection, first-failure retention, all-item continuation and Storage-cleanup warning classification.

`src/lib/documents/file-workspace.test.ts` now verifies private-link formation and denial of invalid identifier or non-HTTP(S) application origin.

## Required local QA without GitHub Actions

Use a clean checkout/worktree separate from Cursor's active modifications:

```powershell
cd D:\MyApp\StreakBooks
git fetch origin
git worktree list
# Create a separate worktree only if D:\MyApp\StreakBooks-Files does not already exist:
git worktree add --detach D:\MyApp\StreakBooks-Files origin/feature/files-workspace-ux-20261106
cd D:\MyApp\StreakBooks-Files
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/file-batch.test.ts src/lib/documents/file-workspace.test.ts src/lib/documents/folder-tree.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

If the worktree already exists, inspect `git status`; do not overwrite uncommitted work. Re-create or update it safely after saving any changes.

## Browser + database acceptance

1. Select 1, 25 and zero files. Attempt duplicate and more-than-25 batches at the helper boundary. Test long file names, mixed upload types and filters.
2. Bulk delete 3 temporary test files, cancel the confirmation, then confirm. Check deletion, list refresh, linked-document attachment disappearance, private object cleanup, audit event and filename-based search.
3. Deliberately revoke one selected file's permission mid-batch; verify earlier deletions are reported, later items are attempted, failed IDs persist and retry requires confirmation.
4. Deliberately simulate a Storage remove error after metadata deletion. Verify administrator warning and no automatic retry of already-deleted IDs; check the Storage object's existence and visibility of cleanup audit evidence.
5. Bulk move across nested folders with one failed item; verify the failed item can be retried after pagination changes.
6. Copy a file link and open it as the same user, an authorized second user, a read-only member lacking specific record permission, and a user from another tenant. No unsigned public access.
7. Test switch-company during an in-progress batch. Ensure no cross-company deletion, stale selection or permission bypass.
8. Test browser clipboard denial and permissions, mobile viewports, keyboard focus, dialog cancellation and a network interruption.
9. Confirm old single-file and linked-record deletions still work with the new return shape.
10. Refresh the feature branch against concurrent `main`, ensure no collisions, then run full local checks before considering merge.

## Future batches

No email-to-Inbox service, OCR, document classification, duplicate content hashing, version history, retention controls, trash/recycle bin or automated Storage orphan cleanup is included here.
