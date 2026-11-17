# LinkBooks — Master progress tracker

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline commit** | `edeeb092` (GitHub `main` after #229 + #230) |
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
| Requirements marked Complete and Verified | **0** | Staging/production gates not certified |
| Merged this integration wave | #229, #230 | Historical AP as-at; PO goods receipt foundation |
| Open product PRs | #225 (draft), #227 (draft/conflict), #231–#236, #237 CI | Stack being rebased onto main |
| Migrations applied to staging/prod | **Not authorized / not applied** | SQL present in repo only |

## Execution batches

| Batch | Status | Evidence |
|-------|--------|----------|
| B0 — Tracker + IP register + full-coverage gap skeleton | **Done on branch** | This file; IP register; gap register |
| B1 — Historical Aged Payables (dated AP allocations) | **PR open** | https://github.com/linkbusinessadvisory/LinkBooks/pull/229 |
| B1.1 — Period close uses dated AR/AP as-at | **Pushed on #229** | `30238d5a` — PeriodClosePanel + `period-close-subledger` |
| B2 — PO goods receipt foundation | **PR open** | https://github.com/linkbusinessadvisory/LinkBooks/pull/230 — migration pending authorized apply |
| B3 — PO three-way match (order×receipt×bill) | **PR open** | https://github.com/linkbusinessadvisory/LinkBooks/pull/231 — stacked on #230 |
| B4 — Partial bill-from-received | **In progress** | Branch `feature/po-partial-bill-from-received-20261117` stacked on #231; bills only unbilled received qty; no inventory/COGS claim |

### B1 typecheck remediation (2026-11-17)

| Check | Result |
|-------|--------|
| Failure | Shell `787035` exit 2 — TS4111 on `Record<string, unknown>` dot access in `historyAllocation` |
| Fix | Index signature access via `src["bill_id"]` (etc.) |
| Re-run | Full `tsc --noEmit` exit **0** (shell `177001`); focused vitest **9/9** |

## Current blockers

1. GitHub Actions hosted jobs fail instantly with empty steps (infra/billing) — local verification used for merges.
2. #227 remains conflicting draft; lean CI is #237.
3. Staging/production migration apply requires explicit authorization.
4. Coding Memory #225 remains draft — coordinate, do not duplicate.

## Next executable step

1. Open/review B4 partial bill-from-received PR (depends on #230/#231).
2. Keep #229–#231 unmerged until reviews; do not apply live migrations without authorization; quality.yml restore remains #227.
3. After B4: honest inventory valuation/COGS only if stock layers exist; else next P0 bookkeeping gap. Avoid Coding Memory (#225).
