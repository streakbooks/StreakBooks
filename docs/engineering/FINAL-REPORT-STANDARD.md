# Mandatory StreakBooks final status and verification report

Use this format at the completion of every StreakBooks development task, fix, review, PR,
merge, deployment or command-execution task. Do not require the user to repeat it.

## Final result — [Successfully merged into main / Partially completed / Failed / Pending verification]

Describe the actual verified outcome. A local merge is not a GitHub merge; a GitHub merge
is not a deployment. Never claim all features or all live workflows were verified from fixtures.

| Item                        | Status                                                                          |
| --------------------------- | ------------------------------------------------------------------------------- |
| Task implementation         | Completed / Partial / Failed                                                    |
| Pull request                | Actual PR number and clickable GitHub URL, or not created                       |
| Merge into main             | Actual GitHub merge status; identify local-only merges                          |
| Verified main commit        | Actual SHA and verified GitHub commit URL                                       |
| Pre-merge GitHub CI         | Passed / Failed / Not run; link actual run                                      |
| Unit tests                  | Actual passed and failed counts and tested revision                             |
| Integration tests           | Actual results; distinguish isolated/local and live databases                   |
| Browser / E2E tests         | Actual counts, fixture/live distinction and coverage                            |
| TypeScript validation       | Passed / Failed / Not run                                                       |
| Production build            | Passed / Failed / Not run                                                       |
| ESLint                      | Actual errors and warnings; distinguish full-repository and changed-file checks |
| Supabase migrations         | Applied / Pending / Not required; never infer application from committed SQL    |
| Vercel deployment           | Deployed / Pending / Not deployed; actual URL when verified                     |
| Authenticated staging tests | Passed / Failed / Not executed                                                  |
| Production verification     | Verified / Not verified                                                         |

Link the actual PR, commit, GitHub Actions run and application when available. Do not fabricate
URLs to unpublished local commits or claim a skipped CI job passed.

## Local PowerShell review

User workstation: `D:\StreakBooks`. Development URL: `http://localhost:8080`.
The cloud executor's checkout is separate; never claim it changed this Windows directory.
Before switching branches or pulling, inspect and protect uncommitted work. A safe review sequence:

```powershell
cd D:\StreakBooks
git status
if (git status --porcelain) { throw "Commit or stash your changes before continuing." }
git switch main
if ($LASTEXITCODE -ne 0) { throw "Branch switch failed." }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Pull failed. Do not reset local work." }
git log -1 --oneline
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
npm.cmd run dev
```

Explain any additional environment setup or migration commands exactly. Do not print secrets.
If work is unpublished, explain that pulling main will not retrieve it.

## Manual review checklist

Include the module, page/tab/button, specific actions, expected success, edge cases and
permissions. Explicitly identify desktop/tablet/mobile and keyboard/accessibility review.
Use a dedicated test organisation for financial mutations.

## Remaining limitations and next steps

Disclose incomplete work, bugs, failed/skipped/unexecuted tests, migration/deployment status,
missing integrations or access, accounting/security/performance verification limits and manual
intervention. Never describe partially completed work as fully delivered.

Authoritative repository: https://github.com/streakbooks/StreakBooks.
Review and test before merging; verify the actual GitHub main commit and Actions results.
Publishing/merging requires session authorization; deployment and live migration execution are
separate actions. Preserve the user's uncommitted work and published history.
