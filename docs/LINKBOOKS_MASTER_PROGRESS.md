# LinkBooks — Master progress tracker

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline commit** | `ddaff917` (GitHub `main` at session start) |
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
| Migrations on disk | 347 | Application to staging/prod is separate |
| Gap register rows (this refresh) | See [FULL_COVERAGE_GAP_REGISTER.md](./FULL_COVERAGE_GAP_REGISTER.md) | Classifications are evidence-based |
| Requirements marked Complete and Verified | **0** | No module has passed full acceptance + staging + production gates in this tracker |
| Requirements Partial / in progress | Majority of core bookkeeping | Real code exists; live acceptance incomplete |
| Open product PRs (non-draft blockers) | #225 Coding Memory (draft), #227 release gates (draft, conflicting) | Recheck before duplicating work |

**Do not claim 100% completion** until every in-scope requirement has passed its defined acceptance and release gates.

## Execution batches

| Batch | Status | Evidence |
|-------|--------|----------|
| B0 — Tracker + IP register + full-coverage gap skeleton | **In progress** | This file; IP register; gap register |
| B1 — Historical Aged Payables (dated AP allocations) | **Implemented locally** | `ap-asat.ts`, `ap-reports.functions.ts`, Reports UI wired; unit tests |
| B2+ — Next financial-correctness / fail-closed module gaps | Pending | Priority: PO matching, inventory valuation, timesheets, bank feeds (provider), Coding Memory (#225) |

## Current blockers

1. Authenticated staging E2E and production verification not run in this session.
2. PR #227 conflicts with main after #228; release-gate repair needs rebase/decision.
3. External providers (bank feeds, email delivery, payroll filing) remain fail-closed / unavailable until configured and verified.
4. Pre-archive deleted AP allocations cannot be reconstructed (documented limitation).

## Next executable step

1. Land B1 PR with originality/IP note after unit tests pass.
2. Recheck #225 vs main typecheck readiness; do not duplicate Coding Memory.
3. Continue gap register depth for Banking reconciliation and Inventory/COGS.
