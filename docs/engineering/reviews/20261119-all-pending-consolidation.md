# Pending-branch consolidation — 19 November 2026

Status: source consolidation and local verification complete. GitHub PR #295 and the main branch are authoritative for publication and merge status. No deployment is certified by this report.

## Scope and preserved history

Canonical repository: https://github.com/linkbusinessadvisory/LinkBooks.
Consolidation PR: https://github.com/linkbusinessadvisory/LinkBooks/pull/295.
Touch-accessibility PR included: https://github.com/linkbusinessadvisory/LinkBooks/pull/333.

All recorded branch references listed in the JSON audit are ancestors of the
integration history. Existing published
commits were preserved. No force push, rebase, published-history amendment, or branch
deletion was used. Main is updated only by an ordinary fast-forward push of the
verified integration commit; a concurrently advanced main must be incorporated first.
The source snapshot and actual verification results are recorded alongside this report.

Some earlier PRs were resolved independently while integration was being prepared:
#251, #252 and #238 are merged; #227 is closed, and its head is included by ancestry.

## Conflict decisions and compatibility repairs

- Preserve current main purchase-order-linked bill controls, delegated screens,
  full-page creation, catalogue/price-list controls, POS sales/refunds, Property
  Management, grouped navigation and touch dialog controls.
- Preserve pending-branch Banking durable feedback/learning and permission checks,
  workpaper comparison, contact column preferences, Files folders/classification/
  versions/retention/recycle workflows, firm requests, and responsive shared workspaces.
- Combine URL browsing validators with new creation flags. Retain filters during
  Accounting tab navigation and keep catalogue reads valid on both list and new routes.
- Retain shared lookup primitives, safe URL parsing, typed query contracts, actual
  audit RPC signatures, and the current settings migration filename in purchase tests.
- Record patch-equivalent histories with ancestry-preserving merges only after
  comparing their commits against main. No unique feature was discarded merely to
  resolve a conflict.
- Repair duplicate migration identities without changing the already established
  Advisors identities. Preserve dependent Files migration order:

| Original Files migration                              | Reconciled Files migration                            |
| ----------------------------------------------------- | ----------------------------------------------------- |
| 20261106140000_files_email_inbox.sql                  | 20261118150351_files_email_inbox.sql                  |
| 20261106160000_files_document_classification_tags.sql | 20261118150352_files_document_classification_tags.sql |
| 20261106170000_document_attachment_versions.sql       | 20261118150353_document_attachment_versions.sql       |
| 20261106183000_files_recycle_retention_cleanup.sql    | 20261118150355_files_recycle_retention_cleanup.sql    |

The existing firm bulk-profile migration required missing PL/pgSQL terminators to
replay cleanly. These historical corrections and the Files renumbering still require
comparison with the target database history/checksums before any hosted upgrade.
Do not run migration repair or apply the whole history blindly against a hosted project.

Two additive migrations preserve the established MFA restrictions across merged
workflows. The authorised demo reset retains durable, tenant-owned Storage cleanup
receipts while direct document deletion, spoofed reset settings and non-demo resets
remain denied. The POS fixture loads the canonical MFA helper and verifies AAL1
read denial and authorised AAL2 reads using real sale/refund records.

## Verification results

Latest tested application source: `6ee171111d3758ed84ca8b714fa68d20c0adb432`. Subsequent main refreshes preserve the application, fixture and migration sources; the last refresh adds a release-reporting harness fix, separately verified with eight Node tests and scoped lint. The report commit only adds verification documentation.

- Full unit suite: 4,335 passed, zero failed, across 630 files.
- Full ESLint: zero errors and zero warnings.
- Ten isolated PostgreSQL suites passed: Banking, POS, purchase orders, workflows,
  platform, document review, accountant exceptions, correction approvals,
  workpaper items and billing.
- Real local Banking browser: eight passed, zero failed; includes persisted posting,
  retry, company switching, read-only denial, desktop/tablet/mobile keyboard use,
  and retry-safe confirmed reset.
- Real local reversal: four checks passed. Real local MFA: 15 checks passed.
- Static repository, UI, module, lookup, navigation, browsing/visual inventory,
  migration identity and route resolver checks passed.
- Production build and client bundle gate passed. Bootstrap: 61 modules,
  975,879 bytes / 288,985 gzip bytes.
- Section 18 verification-harness tests: eight passed, zero failed. This tests the
  release verification harness; it does not represent staging/production acceptance.
- Full final TypeScript passed on the latest source. Full unit/build checks were
  repeated successfully after integrating the final recurring-schedule fix.
- Shared UI fixtures: 97 passed; Coding Memory fixtures: seven passed;
  final create-panel fixtures: 22 passed; POS fixtures: ten passed. This is 136
  fixture cases, separate from the eight real local Banking browser cases.
- Full ESLint passed on the baseline; all four files in the subsequent recurring
  change passed scoped ESLint with zero errors and warnings. The final full unit
  run passed all 4,335 tests across 630 files, and final UI contracts passed.
- The recurring-schedule fix adds a backward-compatible optional disabled-close
  property, locks submitted fields while saving and restores editing on failure.
  The new regression covers pending requests, Escape/Close/Cancel, retained draft
  values and failure recovery. Shared UI, Banking and POS results predate this
  four-file dialog/fixture change; the 22-case create suite runs on the latest code.

The successful build still emits existing TanStack `inputValidator` deprecation
warnings and Vite integration notices; these are not a claim of warning-free builds.

The first browser discovery was interrupted by a confirmed Vite dependency-optimizer
full reload. After read-only popup prewarming and fresh isolated fixtures, the same
unmodified assertions passed. This does not waive a failed browser assertion.

Latest pre-merge Actions run:
https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44451090993 — failed
before any of its six jobs executed steps; logs and step arrays are absent.
The billing reason is evidenced by the earlier user-supplied annotations below;
this newer run exposes no annotation text through the connected tools.
The isolated database replay matched all 375 source migration versions exactly.
Local security advisors reported no issues at warning/error severity.
The API setup passed 28 checks using real localhost Auth, PostgREST and RLS.
The combined workflow SQL passed 16 restrictive-policy checks, non-demo denial,
spoofed direct-delete denial and authorised demo-reset cleanup receipt checks.
All fixture changes in that SQL were rolled back. The caller-search-path smoke
passed for 19 helpers. These are isolated local results, not hosted acceptance.

The CLI reset returned a native container-health timeout after all migrations ran.
The host API was independently verified, and database migration versions were
compared exactly rather than treating that CLI exit as a successful reset command.
No health-check timeout is reported as a passing CLI run.

## CI billing exception

The user supplied the account-payment/spending-limit annotations from
https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44256575474:
all jobs were prevented from starting. The standing repository instruction in
`.cursor/rules/merge-without-ci-billing.mdc` authorises merging after local gates pass
when that is the sole Actions blocker. A billing-blocked run is not a passed test.
Actual test/type/lint failures must be repaired before merging.

Vercel read-only context inspection found no Git-linked project in the connected
LinkBusiness team. No corresponding deployment revision is verified. This does
not establish the state of any separate Lovable or other hosting deployment.

## Safe Windows review

The cloud checkout does not modify `D:\MyApp\LinkBooks`. The original Windows
checkout has untracked messaging files; preserve it by opening a separate worktree:

```powershell
cd D:\MyApp\LinkBooks
git status
git fetch https://github.com/linkbusinessadvisory/LinkBooks.git main
if ($LASTEXITCODE -ne 0) { throw "Fetch failed." }
git worktree add --detach D:\MyApp\LinkBooks-main-review-20261119 FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed; preserve existing work." }
cd D:\MyApp\LinkBooks-main-review-20261119
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Installation failed." }
# Configure this worktree for an isolated test project; do not copy production service keys into browser variables.
npm.cmd run dev
```

Development URL: http://localhost:8080. Do not run hosted migrations as part of these
review commands. If the review directory already exists, inspect it and choose a new
path; do not remove or reset it blindly.

## Manual acceptance still required

Use a dedicated test company for financial mutations.

- Banking Transactions: select a suggestion with keyboard and pointer; reject and
  retry after an interrupted response; switch company and confirm prior-company
  evidence disappears; verify reader denial, one balanced posting, and reversal evidence.
- Files: upload/version/classify/tag, folders, recycle retention/protection, authorised
  purge receipts and demo reset; confirm another company cannot access the documents.
- POS: catalogue/quotes, session open/close, expected cash, cash sale/refund retry,
  permission denial and journal/audit evidence. Review Property Management workflows
  and real accounting effects independently.
- Exercise new-record routes and Cancel/Save/refresh/Back/Forward across Products,
  Budgets, Fixed Assets, Payroll, Sales and Purchases; check restored list filters.
- Recurring journals: edit a schedule, save, verify pending controls are locked, then
  simulate failure and confirm the retained draft becomes editable again.
- Review desktop/tablet/mobile, touch close controls, keyboard-only operation, focus,
  screen-reader labels, contrast, error recovery and realistic data volumes.

## Deployment and release limits

This task consolidates source branches. Hosted migration history reconciliation,
backup/restore rehearsal, authenticated staging acceptance, deployment revision
verification and production sign-off remain separate gates. No hosted database
mutation or manual deployment was performed. Automatic deployment status must be
reported from observed evidence. The 29-module inventories still mark zero modules
fully accepted. This merge does not constitute full financial-intelligence Phases 2–7
acceptance or whole-application production readiness.

The sanitized JSON audit records source revisions, branch ancestry, migration
renumbering, scoped evidence and verification outcomes. All migration file hashes
remain identical to the verified 375-version isolated replay snapshot.
