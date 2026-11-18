# LinkBooks financial intelligence programme — 17 November 2026

Latest continuation: [Batch 05 scoped Coding Memory reset](BATCH-05-SCOPED-MEMORY-RESET.md). The earlier audit matrices and batches are historical; use the latest evidence for current results. Full programme acceptance remains 0/53.

## Result and baseline

PARTIALLY COMPLETED. Phase 0 is a preliminary audit with unresolved gates; Phase 1 has a focused suggestion-safety batch. Phases 2–7 have not been implemented by this batch. No full feature acceptance or production-readiness claim is made.

Authoritative repository: https://github.com/linkbusinessadvisory/LinkBooks. Main fetched and verified at `a2a8a79efbf8ad11b0aa64bd00a7e64095ba0484`. Implementation code revision: [`743c73fc`](https://github.com/linkbusinessadvisory/LinkBooks/commit/743c73fcddf9611657c8b0d3a2c0351bf3de4bc6), [draft PR #225](https://github.com/linkbusinessadvisory/LinkBooks/pull/225) on `feature/financial-intelligence-foundation`. The initially supplied `/workspace/LinkBooks` checkout points to a different repository (`rohitmehra86/LinkBooks`, main `a4e6dfe0`); it was not used as the implementation baseline. A separate worktree preserves its work.

Open drafts inspected: [#224 messaging](https://github.com/linkbusinessadvisory/LinkBooks/pull/224), [#223 calculator](https://github.com/linkbusinessadvisory/LinkBooks/pull/223). Recent merged PRs reviewed through metadata include #222 HR and #221/#220 CRM. Branch inventory includes firm portfolio, workpaper period comparison, firm requests/analytics, premium browsing and messaging work; their unmerged diffs require deeper review before overlapping changes. No unrelated branches were changed.

## Current implementation matrix

“Production verified” means authenticated functional verification, not merely that an object exists.

| Capability      | Existing                                                                                                                                                                                                                  | Reusable                                                                       | Missing / unverified                                                                                                           | Defective / risk                                                                                                                                                                                                                                                                                 | Needs migration                                       | Needs testing                                                                                         | Production verified |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| Coding Memory   | [ranking](../../src/lib/banking/suggestions.ts), [server loader](../../src/lib/banking/banking.functions.ts), [coding](../../src/lib/banking/coding-server.ts), [history helper](../../src/lib/banking/server-helpers.ts) | Existing bank coding, rules, posting engine, history                           | Durable accepted/edited/rejected feedback; preference controls; tax/contact/split/currency evidence; supporting-history drawer | Increment-only history RPC lacks event identity; retries and reversals require lifecycle design. This batch fixes scope-blind matching, misleading percentages and hidden query failures. History remains bounded to 100 with explicit coverage warning; rules retain existing API response cap. | Yes for remaining lifecycle, design pending           | Local unit/mocked tests executed; live RLS, retry, reversal, concurrency and browser checks remain    | No                  |
| Error Shield    | [ledger health](../../src/lib/accounting/ledger-health.ts), reconciliation review migrations `20261106233000` / `20261106234500`, [expense risk](../../src/lib/expenses/risk.ts)                                          | Review cases/events, ledger checks, existing source evidence                   | Unified coverage registry, persistent detector runs, supported detector catalogue, authoritative resolution verification       | Existing reviewed/resolved semantics must be reconciled with stricter requested lifecycle                                                                                                                                                                                                        | To be determined after full schema audit              | Detector completeness, fingerprints, unavailable checks, negative tenant tests                        | No                  |
| Live Close      | [close facts](../../src/lib/accounting/period-close.functions.ts), [checklist](../../src/lib/accounting/period-close.ts), [panel](../../src/components/accounting/PeriodClosePanel.tsx)                                   | Periods, year-end posting, AR/AP facts, practice work                          | Close runs/templates, dependencies, independent approvals and evidence revisions                                               | Panel re-fetches facts before separate lock RPC; repository `lock_accounting_period` in migration `20261019140000` updates the period without atomic close-readiness evaluation. Concurrent posting/close must be tested.                                                                        | Yes, atomic policy/readiness design needed            | Local checklist tests pass; concurrent lock/post, revisions, year-end staging remain                  | No                  |
| Mission Control | [firm pulse](../../src/lib/firm/firm-analytics.functions.ts), [client portfolio](../../src/lib/firm/client-portfolio.ts), Firm & Clients                                                                                  | Existing links, assignments, RLS, practice tasks and company switching         | Full permissioned health/close aggregation and bulk-action policy                                                              | Pulse explicitly throws above 200 clients (`limit(201)`); access checks are batched 10 at a time; other firm queries have independent caps                                                                                                                                                       | Determine from measured query plans; no new directory | 10/50/200/500+ load, partial failure, permission revocation                                           | No                  |
| Financial Brain | [AI functions](../../src/lib/ai/ai.functions.ts), [financial insights](../../src/lib/ai/financial-insights.ts), [journal explanation](../../src/lib/ai/journal-explanation.functions.ts), review/history modules          | Deterministic insights, provider config, sanitisation, review/posting boundary | Structured investigations, all-five evidence labels, source-permission tool contracts, cross-module investigation history      | AI billing helper tolerates missing allowance RPC; policy needs explicit review. Source-specific permissions and prompt-injection handling need full audit                                                                                                                                       | Determine after data/retention contracts              | Financial accuracy, source permissions, provider failures, cost caps, injection and history isolation | No                  |

## Environment and migration evidence

Supabase discovery returned one active LinkBooks project, `ipxflpzfcqwtenodbxwc` (`linkbook`), PostgreSQL 17.11, and inactive unrelated LeadOrbit. Prior merged PR metadata identifies the active project as production; treat it as production. Branch listing returned no development branches. All Supabase calls in this session were read-only.

Read-only catalog inspection confirms RLS enabled on `bank_coding_history` (3 policies), `bank_rules` (5), `practice_tasks` (2), and reconciliation cases/events (1 each). This proves neither effective authorization nor cross-tenant safety; denial tests remain mandatory. Inspected live `bump_bank_coding_history`: SECURITY DEFINER, authentication/member/`banking.categorise` checks, account-company check and increment-on-conflict, without event deduplication. No credentials or customer accounting rows were exported.

Migration comparison: 335 repository SQL files, 332 distinct versions, 362 remote entries; 43 repository-only and 73 remote-only versions. See [exact version differences](migration-drift-20261117.json). Version drift does not prove missing schema: objects can have been applied under other versions. Compare definitions and provenance before any repair, push, or rollout. No migrations were added or applied. Clean-install and current-schema upgrade checks remain unexecuted.

Vercel read-only discovery: project `prj_jtVtlCzhUNfd7a3weiC8QIMDT3ah`, team `team_M5DS8zUvq8eVtkjKLAJFBLLP`; most recent returned production deployment `dpl_ArKGNHnzbx7bTFjJcaPbSLYUkrar`, READY, commit `64f6fe82a62f5f0aa06f12da5f74c12a456b7a3d`, URL https://linkbooks-j5g72qqty-link-business1.vercel.app. It predates fetched main. No deployment was initiated; READY metadata is not authenticated functional verification.

## Implemented batch

- Reuse `ruleMatchesTransaction` for direction, inclusive amount ranges, bank-account scope and stored reference/payee fields; retain deterministic rule ordering.
- Do not match empty payees or fragments inside unrelated payee tokens; filter invalid history counts and deduplicate account suggestions.
- Flag conflicting account history before applying output limit; expose qualitative matching strength rather than heuristic percentages.
- Require `banking.view` server-side; scope joined eligible accounts to the company; exclude inactive, archived, control and non-postable accounts.
- Fail visibly on unavailable transaction/history/rule evidence; use existing query retry with a working Retry control and loading state.
- Report the bounded history coverage and avoid an unsupported claim that the external AI provider is unconfigured.
- Preserve posting, account, tax and period validation. Suggestions still only prefill the existing coding panel.

Exact source changes: `src/lib/banking/suggestions.ts`, `src/lib/banking/banking.functions.ts`, `src/routes/_authenticated/banking/transactions.tsx`; extended `src/lib/banking/suggestions.test.ts`; added `src/lib/banking/suggestions.functions.test.ts`. Programme documentation, requirements inventory and migration drift are added under this directory. No source files removed.

## Architecture decisions and sequencing

ADR-001: Enhance existing Banking, Accounting, Firm & Clients and AI surfaces. Existing posting/reversal, ledger, company membership and fiscal-period owners remain authoritative; no competing ledger or directory.

ADR-002: A recommendation is read-only evidence. Learning must eventually be committed against a unique authorised posted coding event, with reversal/correction invalidation. Neither a UI click nor the existing aggregate counter is sufficient proof of an approved precedent. Do not backfill unverified aggregate rows as approved events.

ADR-003: Close-readiness evaluation and locking must share database concurrency protection with posting. Client re-fetch is useful UX but not the enforcement boundary. Define lock order and race tests before implementation.

ADR-004: Reuse review/event workflows; introduce a detector run registry only after verifying coverage gaps. Verified resolution requires successful authoritative recheck, not a reviewer status update.

ADR-005: Firm aggregation uses caller permissions/RLS, bounded batches/pagination and explicit coverage. Measure before introducing caching or workers. Financial Brain consumes trusted report calculations with source scope and dates/basis/currency preserved.

Dependency order: finish baseline/schema provenance and isolated database → CM event lifecycle and controls → Error Shield run/findings lifecycle → atomic Live Close → scalable Mission Control → governed Financial Brain → integration scenarios → release gates. Branches may be stacked after prerequisite contracts pass; this report does not certify Gate 0.

## Security and permissions / threat model

| Feature         | Read boundary                                       | Consequential action                                                                         | Threat and required negative test                                                                      |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Coding Memory   | Company + `banking.view`, eligible company accounts | Existing `banking.categorise`; future preference administration permission must be specified | Cross-company account references, revoked access, replayed feedback, poisoned aggregate history        |
| Error Shield    | Per-source accounting/report/document permissions   | Authorised review; correction via existing posting/reversal                                  | Fingerprint collision, false healthy scan after failure, reviewer declaring resolution without recheck |
| Live Close      | Accounting/report/reconciliation scope              | `periods.lock`, independent approval policy, existing journal permissions                    | Concurrent posting after checklist, self-approval, stale evidence, unauthorised reopen                 |
| Mission Control | Firm membership + current client/source grants      | Check each client/action individually                                                        | Revoked links, stale company cache, overbroad bulk operations, partial-query failure                   |
| Financial Brain | `ai.use` plus permission for every retrieved source | Draft/review permission and existing posting checks                                          | Prompt injection in documents, cross-tenant evidence leakage, invented amounts, bypassed caps          |

Database strategy: additive versioned changes only, tenant-aware composite relationships, RLS and explicit grants, auditable mutations and event idempotency. Discover actual CLI version/help before migration commands. No service-role workaround. Production migrations require separately reviewed release approval.

Feature flags/rollback: this batch adds no new independently enabled feature or schema. Revert its code commit to roll it back; do not reset published history. Future capabilities should use the existing feature catalogue with default-disabled tenant activation, observability, compatibility window and explicit rollback plan. Backup restoration and flag operations are not yet exercised.

## Acceptance and progress

[Requirement inventory](requirements.csv) counts the directive's 53 named criteria (10 CM + 10 ES + 11 LC + 10 MC + 12 FB). Each criterion contains additional subrequirements; this is not a count of all release/security/integration obligations. Five CM criteria have partial work in this batch; none is claimed fully implemented or acceptance-verified. Overall: **0/53 full feature criteria verified**, not an estimate of existing product completion.

| Phase | Feature/workstream                     |                             Total |      Implemented fully |    Tested fully | Verified |         Remaining | Blocked/dependencies                                                              | PR/CI/deployment                              | Owner/evidence     |
| ----- | -------------------------------------- | --------------------------------: | ---------------------: | --------------: | -------: | ----------------: | --------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ |
| 0     | Architecture / security / DB / release |               18 foundation tasks | 0 acceptance-certified |               0 |        0 | 18 not signed off | Preliminary audit; schema provenance, staging and performance baseline incomplete | Draft PR #225; no CI runs                     | Codex; this audit  |
| 1     | Coding Memory backend / UX / testing   |                                10 |          0 (5 partial) | 0 full criteria |        0 |                10 | Event lifecycle, controls and live tests                                          | Draft PR #225; code `743c73fc`; no deployment | Codex; local tests |
| 2     | Error Shield all workstreams           |                                10 |        0 in this batch |               0 |        0 |                10 | Schema/registry and detector contracts                                            | None                                          | Unassigned; matrix |
| 3     | Live Close all workstreams             |                                11 |        0 in this batch |               0 |        0 |                11 | Atomic close/post coordination                                                    | None                                          | Unassigned; matrix |
| 4     | Mission Control all workstreams        |                                10 |        0 in this batch |               0 |        0 |                10 | Permissioned aggregation and measured scale                                       | None                                          | Unassigned; matrix |
| 5     | Financial Brain all workstreams        |                                12 |        0 in this batch |               0 |        0 |                12 | Evidence/governance and previous feature contracts                                | None                                          | Unassigned; matrix |
| 6     | Cross-module integration               | 13 scenario steps + failure cases |                      0 |               0 |        0 |               All | Previous capabilities and two-company staging                                     | None                                          | Unassigned         |
| 7     | Security / performance / release       |                         Gates A–H |           0 signed off |               0 |        0 |               All | Full gates and release approval                                                   | No release                                    | Unassigned         |

## Research and infrastructure limitations

Official QuickBooks, Xero, Odoo, Zoho Books and Sage capability pages were requested, along with the Supabase changelog and RLS docs. All seven requests were blocked by the environment network tunnel (403 Forbidden). No competitor research findings are asserted. Retry official research using an available approved browsing path; do not copy visual designs.

There is no authenticated staging session established, no isolated Supabase project selected, and no safe production testing authority for mutations. A paid Supabase branch was not created. These block schema integration and authenticated workflow certification, not all future local development. The current execution delivers a reviewable first batch, not completion of the authorised programme.

## Next executable work and release gates

1. Reconcile the migration version differences against actual object definitions; inspect all overlapping branch diffs. Establish a disposable schema and representative two-company datasets (bank directions, similar suppliers, tax, split, currencies, reversals and locked periods).
2. Design and implement CM-01/03/04/06/09: unique posted-event learning, approved/corrected/rejected feedback, tenant-safe evidence and preference lifecycle. Verify rollback, retries, races and permissions in PostgreSQL before enabling UI controls.
3. Complete source loaders with scalable history/rule coverage, supporting history, tax/contact/split evidence and keyboard/mobile E2E. Current history warning is an explicit limitation, not the scalable final design.
4. Implement Error Shield detector coverage and persistent lifecycle using existing reviews; add failures/skips, stable fingerprints and authoritative resolution verification.
5. Implement close runs and atomic lock policy with posting coordination, independent approvals and revisions; prove posting-vs-lock races.
6. Remove the 200-client pulse barrier with measured aggregation/pagination and partial coverage; load-test 10/50/200/500+ with per-client authorization.
7. Add Financial Brain investigation/evidence tools, source permissions, deterministic facts and bounded provider governance; exercise injection and provider failures.
8. Execute the full integration sequence, native navigation, two-company RLS denial, mobile/keyboard/screen-reader checks; record real p50/p95 and cost metrics.
9. Repair baseline type errors and establish actual CI (quality.yml is fully commented); verify clean migration and upgrade, backup restore, monitoring, staging commit and rollback. Gates A–H remain unsigned. Explicit production approval remains required.

## Executed validation

See [the exact commands, outcomes, revision and manual review instructions](VERIFICATION.md). Final focused suite: 201 passed / 0 failed / 0 skipped. Local build, changed-file lint, UI/navigation/module contracts and isolated PostgreSQL platform runner passed. Typecheck failed identically on main and this branch with 107 diagnostics and zero introduced. No authenticated financial E2E, performance baseline or release certification was performed.

## Batch 02 continuation

[Approved event learning, durable feedback and preference controls](BATCH-02-CODING-MEMORY.md) now replace the initial aggregate-history loader. New migration is verified only in isolated PostgreSQL fixtures; no Supabase/production application. Current focused evidence: 208 unit/mocked tests, 59 PostgreSQL assertions, 5 isolated browser scenarios. Full acceptance remains 0/53; baseline TypeScript and staging/schema/security gates remain open. The earlier matrix describes the original audit baseline; Batch 02 supersedes its implemented Coding Memory details.

## Batch 03 continuation

[Readiness repairs and real Auth/API/browser evidence](BATCH-03-READINESS.md) supersede earlier baseline gate status where explicitly stated. Draft PR #251 integrates main fa57d602 and includes PR #225/#227 implementation without overwriting the remotely advanced foundation branch. Final counts and failed/unverified gates are recorded in the Batch 03 evidence. No full acceptance or production-readiness claim is made.
