# LinkBooks — Master progress tracker

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline commit** | `62e971ed` (GitHub `main` after #229 merge) |
| **Programme** | Complete module coverage & zero-gap execution (with originality-first IP policy) |
| **Authoritative repo** | https://github.com/linkbusinessadvisory/LinkBooks |

## Originality-first & IP protection (mandatory)

LinkBooks is built as an **independent original product**. Competitors (Odoo, Xero, QuickBooks Online, Zoho Books, Sage, MYOB, ERPNext and specialists) are **functional/workflow references only**.

- Do **not** copy proprietary source, UI layouts, illustrations, logos, branding or documentation.
- Prefer independent implementation over reusing Odoo (or other) open-source code; if any OSS reuse is ever proposed, license obligations must be reviewed before merge.
- Do **not** use third-party trademarks in a way that suggests endorsement or affiliation.
- Review dependencies, licenses and attribution before adding packages — see [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md), [THIRD_PARTY.md](./THIRD_PARTY.md), [CLEAN_ROOM.md](./CLEAN_ROOM.md).
- Block release of components with unresolved licensing or IP concerns.
- Progress percentages below are **measured**, not optimistic estimates.

## Overall measured progress

| Metric | Value | Notes |
|--------|-------|-------|
| Modules in `MODULE_REGISTRY` | 28 | Sidebar + hidden operational surfaces |
| Authenticated route files | ~151 | Includes nested sales/purchases/banking/CRM/HR |
| Migrations on disk | 347+ | Application to staging/prod is separate |
| Gap register rows (this refresh) | See [FULL_COVERAGE_GAP_REGISTER.md](./FULL_COVERAGE_GAP_REGISTER.md) | Classifications are evidence-based |
| Requirements marked Complete and Verified | **0** | No module has passed full acceptance + staging + production gates in this tracker |
| Requirements Partial / in progress | Majority of core bookkeeping | Real code exists; live acceptance incomplete |
| Open product PRs | #225 Coding Memory (draft), #227 release gates (draft, conflicting), #230–#236 feature stack, #237 CI restore | Recheck before duplicating work |

**Do not claim 100% completion** until every in-scope requirement has passed its defined acceptance and release gates.

## Execution batches

| Batch | Status | Evidence |
|-------|--------|----------|
| B0 — Tracker + IP register + full-coverage gap skeleton | **Merged via #229** | This file; IP register; gap register |
| B1 — Historical Aged Payables (dated AP allocations) | **Merged** | https://github.com/linkbusinessadvisory/LinkBooks/pull/229 → `62e971ed` |
| B1.1 — Period close uses dated AR/AP as-at | **Merged with #229** | PeriodClosePanel + `period-close-subledger` |
| B2 — PO goods receipt foundation | **Integrating** | Branch `feature/po-goods-receipt-foundation-20261117` / PR #230 — non-posting receive quantities |
| B3–B8 — Match / partial bill / voids / statements | **Open PRs** | #231–#236 — rebase onto main after #230 |
| CI restore | **Open** | https://github.com/linkbusinessadvisory/LinkBooks/pull/237 |

### B1 typecheck remediation (2026-11-17)

| Check | Result |
|-------|--------|
| Failure | Shell `787035` exit 2 — TS4111 on `Record<string, unknown>` dot access in `historyAllocation` |
| Fix | Index signature access via `src["bill_id"]` (etc.) |
| Re-run | Full `tsc --noEmit` exit **0**; focused vitest **9/9** then **12/12** including period-close |

## Current blockers

1. Authenticated staging E2E and production verification not run in this session.
2. PR #227 conflicts with main after #228; lean CI split to #237.
3. External providers (bank feeds, email delivery, payroll filing) remain fail-closed / unavailable until configured and verified.
4. Pre-archive deleted AP allocations cannot be reconstructed (documented limitation).
5. GitHub Actions jobs on this private repo currently conclude failure with empty steps (runner/billing infrastructure). Local gates are being used pending Actions recovery.

## Next executable step

1. Finish rebase/merge of #230 onto `main`, then #231 → #232 stack.
2. Merge independent void/statement PRs #233–#236 after conflict resolution.
3. Restore executable Actions (#237) once runner infrastructure accepts jobs.
4. Apply B2+ migrations only with authorized DB access.
5. Keep Coding Memory #225 coordinated; do not duplicate.
