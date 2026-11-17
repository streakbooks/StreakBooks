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
| B1 / B1.1 — Historical Aged Payables + period-close as-at | **Merged** | #229 → included in `edeeb092` |
| B2 — PO goods receipt foundation | **Merged** | #230 → `edeeb092` — migration pending authorized apply |
| B3 — Fail-closed PO three-way match | **Integrating** | PR #231 cherry-picked onto main after #230 |
| B4 — Partial bill-from-received | **Open** | #232 — rebase after #231 |
| B5–B8 — Bill/credit/payment void dates + supplier statement | **Open** | #233–#236 |
| CI restore | **Open** | #237 — Actions jobs currently empty-step failures on private repo |

## Current blockers

1. GitHub Actions hosted jobs fail instantly with empty steps (infra/billing) — local verification used for merges.
2. #227 remains conflicting draft; lean CI is #237.
3. Staging/production migration apply requires explicit authorization.
4. Coding Memory #225 remains draft — coordinate, do not duplicate.

## Next executable step

1. Merge #231 then #232 stack.
2. Rebase/merge #233–#236.
3. Recover Actions runners for #237.
4. Resume new feature work only after integration backlog clears.
