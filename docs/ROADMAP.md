# LinkBooks evidence-driven modernization roadmap
**Date:** 3 November 2026 · [Gap inventory](GAP_ANALYSIS.md) · [Architecture](ARCHITECTURE.md)

## Working rules
- Extend existing code; do not rebuild working accounting modules or copy Odoo/Xero code or visual design.
- New features must include a short `docs/features/<name>.md` design, data lineage, company-scoped authorization, reversible/data-preserving migration (if applicable), UI states, tests, and exact-head GitHub checks **before** merge.
- Preserve posted financial data. No migration on live production without schema-drift check, backup/recovery plan and separate acceptance gate.
- Compliance-by-country is **not** achieved by translating UI strings or adding tax percentages. Do not market filing integrations without actual provider/regulator acceptance.
- Every completed milestone records a commit and manual-review steps. Automated tag publication requires an authorized Git tag-writing capability; never invent tag names as if published.

## Dependency-ordered delivery plan
| Order | Priority | Workstream | Depends on | Acceptance criteria |
|---:|---|---|---|---|
| 0 | P0 | **Repository hygiene and reproducible setup** | none | No tracked `.env` or build dirs; ignored local credentials; safe example, CI guard, documented Windows/Linux setup; baseline tests/build pass. |
| 1 | P0 | **Ledger, year-end and period-lock acceptance** | 0 | Authenticated double-entry fixtures across multiple companies, currencies, backdated postings and reversals; zero unbalanced/missing lines; lock-date bypass attempts denied; GL=TB and BS balances. |
| 2 | P0 | **Privileged function/RLS audit** | 0–1 | Inventory callable SECURITY DEFINER functions, intentional anon public endpoints and private worker access; unauthorized cross-company and unauthenticated negative tests, stable grants, no secret exposure, signed-off exceptions. |
| 3 | P0 | **Tax computation and return contracts for US/UK/AU/NZ** | 1–2 | Country-tax truth table for inclusive/exclusive, mixed rates, exemptions, tax-on-cash, credit-note/amendment and rounding; tax return reconciles to source lines and journals; peer-reviewed country packs. |
| 4 | P0 | **Tax filing integrations** | 3 | For each jurisdiction, regulator/authorized provider approval, scoped OAuth/credentials, tested sandbox submission and receipts, retries/idempotency, role boundaries; otherwise clearly labelled export/manual filing only. |
| 5 | P0 | **Bank import/reconcile correctness** | 1–3 | Verify CSV/OFX; add independently designed QIF when justified, duplicate detection, split match, rule precedence, FX and reversal; bank statement/reconciliation/GL tie, no double-post. |
| 6 | P0 | **Scalable multi-account reporting** | 1–3 | Server-side filters and bounded keyset/page queries with matching total; opening/running/closing preserved; complete authorized exports; benchmark >100k lines with index/EXPLAIN evidence. |
| 7 | P0 | **AR/AP dated allocations and foreign balances** | 1–3 | Reconcile each control to as-at subledger, payment/credit/reversal history, FX conversion provenance, strict unsupported-date errors removed only after dated fixtures pass. |
| 8 | P1 | **Multi-currency revaluation, periods and close** | 1,3,7 | Verified rate snapshots, realized/unrealized postings, reversal date, year-end rollover, no duplicate runs; zero/2/3-decimal currency tests. |
| 9 | P1 | **Inventory and landed COGS** | 1,3,5 | Quantity and cost-layer source, no negative/fictitious valuation, controlled adjustments, inventory=GL control by date; no GL-only valuation substitute. |
| 10 | P1 | **Dimension-aware budgets and project accounting** | 1,3,6 | Tracking attribution at line level, splits sum to 100%, report and budget grouping, per-company permissions, reliable drill-down. |
| 11 | P1 | **Multi-entity consolidation and intercompany** | 1,8,10 | Currency translation dates, elimination journal lineage, intercompany matching, minority interests if required, legal-entity source drill-down and audit export. |
| 12 | P1 | **Accounting practice operations** | 1–3 | Firm/client scoped roles, multi-client attention list, month-end checklist workflow, task audit, deadlines/approvals, no access across unrelated clients. |
| 13 | P1 | **Professional reports and delivery parity** | 6,7,10 | All standard financial reports with period comparisons, source drilling, accessible saved configurations, filtered server-backed complete PDF/XLSX/CSV, branding and verified scheduled-delivery receipts. |
| 14 | P1 | **Integrations and migrations** | 1–3 | Versioned accounting API, scoped OAuth, idempotent signed webhooks, audit & replay, controlled CSV/Tally/QBO migration reconciliation and rollback rules. |
| 15 | P2 | **Payroll hooks and advanced automation** | 1–4,14 | Jurisdiction-specific adapters with no invented payroll calculations; verified journal interfaces, consent, audit and year-end test cases. |
| 16 | P0 | **Release certification, security and performance** | each stage | Static/unit/integration/Playwright, authorization and tenant matrices, realistic local synthetic demo fixtures, stress measurements, disaster-restore rehearsal, independent accountant sign-off per supported jurisdiction. |

## Per-item development template
1. Design: feature doc identifies source-of-truth records, posted/unposted boundary, paths, SQL functions, permissions, UI and failure states.
2. Data: additive migration with RLS and least-privilege grants; test against copied anonymized schema; record rollback/forward-only semantics.
3. Backend: transactionally sound services; strong input validation, company scoping and idempotency.
4. Frontend: responsive original components, keyboards, empty/error/loading and progress states; no hidden business logic in browser.
5. Tests: cents exactness, temporal correctness, tenant separation, permissions, DST/timezone/year-end, exchange rates, and report-to-control reconciliation.
6. Gate: `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, required PostgreSQL checks, authorized Playwright; GitHub review before merge.
7. Rollout: small commit into `main` only after green CI, safe deployment and evidence; track release and review notes.

## Baseline acceptance caveats
The existing reporting UI explorer (PR #18) is a **loaded-row presentation**. Do not treat grouping counts as ledger subtotals or its exports as all matching records. Existing cash accounting code is present but every period/source must still be certified. Live staging credentials, delivery-provider setup and external regulator certification are not assumed.

## Recommended next engineering ticket
Ledger and period-lock **signed-in acceptance matrix** (Order 1). Do not add a second posting engine. Start from existing `src/lib/accounting/period-close.functions.ts`, `src/lib/accounting/ledger-health.functions.ts`, `src/lib/platform/ledger-integrity.ts`, posting RPCs and their existing tests. Require multi-client role fixtures and database-backed reconciliation before changing production SQL.


## Engineering delivery status — 4 November 2026

This section records **evidence**, not blanket completion of acceptance criteria.

- **Milestone 0 foundation:** completed via [PR #19](https://github.com/linkbusinessadvisory/LinkBooks/pull/19). `.env` untracked, CI guard, README and documentation.
- **Advanced reporting incremental:** PR #17, #18 and #20 merged; multi-account selectors and loaded-row customization exist. Full server-side ledger pagination and all-matching exports remain open under item 6/13.
- **Milestone 1 accounting integrity — PARTIAL:** PR #21 rejects incomplete/mismatched ledger-health responses and enforces `accounting.view`; PR #22 guards year-end close evidence and exact amount conversion; PR #23 exposes read-only integrity checks at `/accounting?tab=health`. No new database posting engine was created. Staging negative authorization tests, all posting pathways and accountant sign-off still required.
- **Milestone 2 permissions/security — INVESTIGATING:** read-only project metadata checked for RLS and public callable functions; no privilege grants/revocations applied. Validate policies with distinct real user roles and all SECURITY DEFINER routines.
- **Milestones 3–16:** implementation/acceptance pending as listed above. Existing code and data models must be reviewed before any feature is classified Missing or Done.

See the up-to-date [REVIEW_GUIDE](REVIEW_GUIDE.md) for exact commit hashes, manual acceptance and limitations.

## 4 November 2026 banking and tax progress
- **Banking import, milestone 5 (partial):** [PR #26](https://github.com/linkbusinessadvisory/LinkBooks/pull/26) adds independent QIF intake for single-account bank/credit-card statements with explicit date-order review; [PR #27](https://github.com/linkbusinessadvisory/LinkBooks/pull/27) hardens the shared server-side date, numeric, ID and row validation for CSV/OFX/QFX/QIF. Bank-feed providers, transaction matching, posted-GL reconciliation, FX and negative multi-tenant staging acceptance remain unfinished.
- **Tax computation, milestone 3 (partial):** [PR #28](https://github.com/linkbusinessadvisory/LinkBooks/pull/28) prevents silent unsafe numeric conversion and excess quantity precision. Country-specific US/UK/AU/NZ tax source truth tables, return reconciliation, professional sign-off, filing regulators and genuine integration receipts remain unfinished.
- **Security, milestone 2 (partial):** read-only checks under the PostgreSQL `anon` role and a simulated JWT for an outsider with no company membership showed zero visible rows for five selected financial/membership tables. See [SECURITY_REVIEW_20261104](SECURITY_REVIEW_20261104.md) for boundaries and advisor triage. **This is not a signed-in browser authorization certification.**
- **Broader reporting:** independent PR #25 extended account-focused selections to budget, asset and tax ledger reports, and passed main CI. Full server-side report-history pagination and immutable all-matching export are still pending.

See [REVIEW_GUIDE](REVIEW_GUIDE.md) for exact merge commits and manual acceptance.

## 4 November 2026 — FX P0 integrity and report paging

- **Milestone 1 (partial, posting controls):** [PR #32](https://github.com/linkbusinessadvisory/LinkBooks/pull/32) makes the existing posting service reject invalid actual posting/reversal dates, unsafe minor amounts and unverifiable FX rates. The `post_journal` RPC remains the only posting authority, and period permissions and locks continue to be enforced by SQL.
- **Milestone 6 (partial, cash pagination):** independent [PR #30](https://github.com/linkbusinessadvisory/LinkBooks/pull/30) introduced source-recognized cash-basis Account Transactions, and [PR #31](https://github.com/linkbusinessadvisory/LinkBooks/pull/31) added cash-ledger page navigation with intact opening/running balance and explicit page export scope. Server-side pagination and complete exports for **all** reports remain pending.
- **Milestone 8 (partial, FX history):** [PR #33](https://github.com/linkbusinessadvisory/LinkBooks/pull/33) rejects absent known-foreign journal FX snapshots and lossy numeric minor-unit conversions in canonical ledger report adapters. It does not yet certify realized/unrealized revaluations, settlement reversals or cross-entity translation.
- **Database evidence (read-only):** 38 posted journals were inspected; zero were foreign currency, so no actual foreign-history acceptance is claimed. The deployed FX rate lookup already checks membership; neither production rates nor grants were changed.
- **Next P0 dependencies:** authenticated multi-company accounting acceptance, SQL function permissions, full historical AR/AP and GL reconciliation, server-backed all-matching exports, verified tax return math and per-country regulator integrations.

Review the [updated manual acceptance and known limits](REVIEW_GUIDE.md) before a rollout.
