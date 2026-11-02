# LinkBooks reporting implementation and validation — 2026-11-02

**Release status: PARTIAL — not production-certified; main merge withheld.** This report supersedes the earlier saved-library-only audit. Implemented work is preserved on `feat/reporting-ecosystem`; GitHub references and CI status are recorded below when available. User authorization for email testing is recipient and sender `info@linkbusinessadvisory.com`; no other address is authorized.

## Repository and architecture audit

The existing React/TanStack Start application, authenticated server functions, Supabase PostgreSQL, permission model, fiscal calendar, BigInt accounting engine, posted-ledger aggregation RPCs, practice/month-end work board, budget module, shared LookupSelect and Resend provider were retained. There is no replacement ledger, copied competitor UI or parallel accounting database. Baseline main is `7f574d6a025931e71c94a363a1e27100c4c4f4b7`; fetched main was unchanged during final validation. Existing uncommitted user work was not discarded. Lovable history is preserved; no force push is authorized or used.

Read-only reconciliation used three connected organizations: 37/26/22 accounts, 50/41/0 posted lines. Independently checked P&L, Dr=Cr, A=L+E, cash identity and indirect cash bridge all passed. `reporting-live-reconciliation.json` contains counts/status only. Private source balances and identities are excluded from Git.

## Implementation register

| Area | Status | Delivered behavior / remaining work |
|---|---|---|
| Reporting centre | PARTIAL | Home, standard, custom, management, adviser, packs, drafts, published, archived, templates and schedule tabs; actual favourites and pack activity/counts. Recently opened/frequently used report history and complete authenticated navigation matrix remain. |
| Standard reports | PARTIAL | Existing catalogue below retained; existing authoritative statement and analysis runners. No claim that all catalogue items now support new PDF/XLSX/delivery. |
| Saved custom library | PARTIAL | Real create/update, duplicate, rename, delete confirmation, favourite, archive/restore, descriptions, templates, creator/modifier/access metadata, search/sort/type/status filters and 20-row server paging. Shared read/edit access enforced by RLS. Full logout/login UI matrix remains. |
| Advanced builder | PARTIAL | Actual CoA IDs/types, account/group/formula/heading rows, row and column ordering/hiding, nested groups, bounded rational formulas, comparative/fixed/month columns, sign/decimal/percent/negative formatting, notes/header/footer/orientation, preview/save/export. Calculated columns, budget/forecast columns, advanced dimensions/filter DSL, scaling/zero suppression/red negatives and full accounting display controls remain. |
| Management | PARTIAL | Eight documented live financial KPIs, actual report drill links, saved widget selection/order, version-checked updates and old configuration revisions. Dimension filters, dashboard sharing, additional operational KPIs and complete UI persistence tests remain. |
| Budget/forecast | PARTIAL | Existing actual/budget engine retained; persisted forecast assumptions, complete-month baseline, separate growth scenarios, rolling start and completed-month actual comparisons. Cash/working-capital forecast, wider forecast columns and comparative pack integration remain. |
| Commentary | PARTIAL | Persisted pack executive commentary, assigned action items/status, attributable reviewer comments; approved commentary/actions exported. Advanced operational annotations/insight workflows remain. |
| Adviser/CPA | PARTIAL | Actual authorized firm links, selected clients, company-specific financials, real pack statuses and existing practice assignment/review board. Per-currency portfolio totals explicitly labelled combined; no eliminations or consolidation claimed. Cross-client reusable firm pack templates and full negative firm-role test matrix remain. |
| Management packs | PARTIAL | Save/duplicate drafts, reusable private templates, selected ordered sections, preparer/reviewer, frozen source/config SHA, independent approval, publication, archive/restore, exports. Five standard sections supported; custom reports, budgets, forecasts, ageing and KPI sections are not yet pack selections. Firm logo/theme asset integration remains. |
| Lifecycle | PARTIAL | Atomic permission-checked versioned transitions, independent reviewer, review feedback, immutable publication, archive restore and audit; live transactional integration passes. Complete authenticated browser flow and independent reviewer approval remain. |
| Sharing/scheduling/email | BLOCKED | Private/selected/company/authorized-firm access, revocation, durable outbox/leases/retries/idempotency/history, real pg_cron + Edge worker deployed. Provider acceptance is separate from delivered. Server email secret/sender absent; no real delivery/attachment/bounce verification claimed. |
| Shared LookupSelect | PARTIAL | 121 shared declarations, declarative migration adapter, multi-select composition, dark selection, domain variants, flyovers, stable IDs, cancellation/stale-request/cache fixes, rule and CI guard. Complete signed-in module matrix and large legacy caller paging remain. See inventory. |
| Security | PARTIAL | Server reports.view/export checks, tenant RLS, scoped sharing, MFA, revoked-user rechecks, immutable identities, bounded formulas and private worker secret. No committed secrets. Project-wide advisor findings and moderate dependency remediation remain. |
| Scale | PARTIAL | 100k relevant rows, 1000 saved reports, 25 concurrent SQL requests; exact totals preserved. Whole deployed service P95 and memory soak remain unverified. |
| Review/integration | BLOCKED | Author review and checks performed; independent review, CI result/approvals and release acceptance remain gates. No protected-main bypass. |

## Standard catalogue

“Ready” below describes the existing supported runner, not acceptance certification or universal export support.

| ID | Report | Runner | Catalogue state / dependency |
|---|---|---|---|
| `profit-and-loss` | Profit and Loss | `profit_loss` | ready: existing supported runner |
| `balance-sheet` | Balance Sheet | `balance_sheet` | ready: existing supported runner |
| `trial-balance` | Trial Balance | `trial_balance` | ready: existing supported runner |
| `cash-flow` | Cash Flow (bank movements) | `cash_flow` | ready: existing supported runner |
| `statement-of-changes-in-equity` | Statement of Changes in Equity | `equity` | ready: existing supported runner |
| `cash-flow-indirect` | Cash Flow (indirect) | `cash_flow_indirect` | ready: existing supported runner |
| `general-ledger` | Account Transactions | `general_ledger` | ready: existing supported runner |
| `general-ledger-all` | General Ledger (all accounts) | `general_ledger_all` | ready: existing supported runner |
| `journal-report` | Journal Report | `journals` | ready: existing supported runner |
| `aged-receivables` | Aged Receivables | `aged_receivables` | ready: existing supported runner |
| `aged-payables` | Aged Payables | `aged_payables` | ready: existing supported runner |
| `tax-summary` | Tax Summary | `tax` | ready: existing supported runner |
| `audit-log` | Audit Trail | `audit` | ready: existing supported runner |
| `bank-reconciliation` | Bank Reconciliation Report | `link` | ready: existing supported runner |
| `budget-vs-actual` | Budget versus Actual | `budget_vs_actual` | ready: existing supported runner |
| `fixed-asset-register` | Fixed Asset Register | `fixed_asset_register` | ready: existing supported runner |
| `depreciation-schedule` | Depreciation Schedule | `depreciation_schedule` | ready: existing supported runner |
| `executive-summary` | Executive Summary | `executive_summary` | ready: existing supported runner |
| `cash-summary` | Cash Summary | `cash_summary` | ready: existing supported runner |
| `bank-reconciliation-summary` | Bank Reconciliation Summary | `bank_recon_summary` | ready: existing supported runner |
| `general-ledger-summary` | General Ledger Summary | `gl_summary` | ready: existing supported runner |
| `sales-by-contact` | Sales by Contact | `sales_by_contact` | ready: existing supported runner |
| `sales-by-item` | Sales by Item | `sales_by_item` | ready: existing supported runner |
| `purchases-by-supplier` | Purchases by Supplier | `purchases_by_supplier` | ready: existing supported runner |
| `customer-statement` | Customer Statement | `link` | ready: existing supported runner |
| `supplier-statement` | Supplier Statement | `link` | ready: existing supported runner |
| `project-profitability` | Project Profitability | `link` | ready: existing supported runner |

## Backend, data and exports

`src/lib/reports/ecosystem.functions.ts` provides authenticated workspace paging/counts, actual chart/preview capture, saved report/grant loading, sharing, pack CRUD/transitions/comments, model revisions, delivery queue/schedules, immutable capture/export, management, forecasts and firm portfolio APIs. `report-views.functions.ts` reuses existing saved views with accessible-user RLS and validated configs. Public mutation RPCs enforce permission/owner/reviewer/version checks independently of the UI. Direct writes to protected snapshots/outbox/schedules/grants are revoked.

`formula.ts` is a bounded arithmetic parser (no executable code, SQL, functions or property access). Fractions and money remain BigInt/exact decimal strings until display. `custom-definition.ts` validates graphs including hidden rows, foreign-account references, bounded sizes, dates and cycles. Supported custom columns request actual posted-ledger aggregates. Standard document figures call existing accounting builders. A single immutable ReportDocument drives preview, PDF, XLSX, CSV and worker attachments; approved packs use stored facts/config rather than rerunning current data. Invalid BS/TB/cash reconciliation fails explicitly.

PDF embeds licensed DejaVu Sans, wraps headings, repeats headers, splits wide tables, numbers pages and rejects amounts that cannot fit safely. Real PDF text extraction verified all five sections, Unicode, commentary and independently expected 150.00/40.00/110.00 figures. XLSX is opened and every document cell compared; values exceeding Excel's 15-digit precision stay text. CSV preserves financial data, period, header/footer/commentary and formula-injection protection. No claim of PDF/XLSX parity for all existing report runners.

## Database migrations and infrastructure

All six migrations were applied successfully to connected project `ipxflpzfcqwtenodbxwc` (PostgreSQL 17.11):

1. `20261102042056_reporting_ecosystem.sql`: sharing/RLS, facts capture, packs/snapshots/transitions, comments, models, durable schedules/outbox.
2. `20261102043511_reporting_policy_insert_visibility.sql`: correct owner INSERT RETURNING visibility.
3. `20261102044934_reporting_review_and_scheduler.sql`: model revisions/audit, Vault-backed worker authorization, cron dispatch/heartbeat.
4. `20261102050738_reporting_schedule_integrity_review.sql`: calendar anchors, yearly/fiscal schedules, authorization timestamps, hash verification.
5. `20261102052717_reporting_pack_pagination_counts.sql`: invoker/RLS-scoped aggregate counts.
6. `20261102053436_reporting_rls_and_reference_indexes.sql`: reference indexes, cached auth predicates, established restrictive MFA policy.

Generated Supabase types reflect the final schema. Migrations add reporting structures without deleting posted accounting data. The live integration SQL creates isolated synthetic users/companies/posted journals and rolls everything back; it never sends email. Re-run it with an authorized database test connection, not through a browser session with elevated credentials.

`reporting-worker` Edge function version 2 is ACTIVE. The minute cron `linkbooks-report-outbox` is active. The public Edge endpoint performs its own authentication using a Vault-generated server-only token; service-role-only validation and worker RPCs are not callable by application users. No token/key is logged, exposed or committed. Worker source is `supabase/functions/reporting-worker/index.ts`; deployable bundle is generated by `scripts/build-reporting-worker.mjs` (not committed).

The latest worker heartbeat on 2026-11-02 reports `provider_configured=false`; the authorized sender is not configured. Set `RESEND_API_KEY` securely on the server and `EMAIL_FROM=info@linkbusinessadvisory.com`, verify the domain/sender, then run the authorized real test, verify provider delivery and record the message ID/evidence. Do not put the key in chat or Git. Database fixture acceptance/confirmation is a state-machine test only; it is not real delivery evidence.

## Validation evidence

| Check | Recorded result | Scope / limitation |
|---|---|---|
| `npm test` | 166 files / 1308 tests PASS on Vitest 5.0.5 | Entire repository unit suite; no removed or skipped tests to obtain pass. |
| `npm run typecheck` | PASS after typed Vitest mock compatibility update | Final TypeScript boundary validation. |
| `npm run build` | PASS, Vite 8.3.5 | Actual production client/server bundle. |
| Changed-source ESLint | No new findings; 3 existing ListKit refresh warnings | Compared to HEAD, not a claim of zero whole-repository lint. |
| `npm run check:lookups` | 121 declarations, zero violations | Source architecture guard; not full runtime coverage. |
| `npm run test:reporting` | 6 PASS | Actual components at 390/768/1440px; formula/reorder/config persistence, 10k paginated lookup, keyboard/disabled/create/cancel. Fixture storage is not Supabase re-login proof. |
| `npm run test:practice` | 2 PASS | Existing practice work-board regression. |
| `npm run test:corrections` | 8 PASS | Real shared lookup interaction replaces native selector assertions. |
| `npm run test:themes` | 5 PASS | Existing document theme previews/export regression. |
| `npm run test:voice` | 57 PASS | Existing assistant regression with installed system Chromium. |
| `npm run test:wake` | 6 PASS | Existing acoustic/wake regression with installed system Chromium. |
| Live `supabase/tests/reporting_ecosystem.sql` | PASS after all migrations | 1000 reports, real posted ledger expectations, tenant/grant/MFA negatives, versions, independent review/feedback, immutable snapshot/audit, schedule/recurrence/outbox state machine; rollback, no send. |
| Connected read-only reconciliation | 3 companies, all 5 invariants PASS | Counts only in `reporting-live-reconciliation.json`; raw finances excluded from Git. |
| PDF/XLSX/CSV | 7 document tests PASS + real PDF extraction PASS | Shared supported document formats; broader runner coverage remains. |
| Performance | SQL P95 143/716/672/86ms; 25 concurrent, zero errors | Standard/custom/dashboard/search in isolated 2-CPU/768MiB PG17 container with 100k lines. Not deployed end-to-end P95 or memory certification. |
| Dependency audit | High 0, critical 0 after upgrades | Whole dependency audit retains moderate findings; production dependency summary recorded separately. |

Initial voice/wake execution could not find Playwright's packaged Chromium. The same unmodified assertions passed with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; CI installs its browser. Vitest 5 exposed an older broadly typed wake test mock; its callback type was made explicit without changing assertions. Existing failing infrastructure runs are not counted as feature passes.

Focused test files: `formula.test.ts`, `custom-definition.test.ts`, `saved-report.test.ts`, `report-views.functions.test.ts`, `document-export.test.ts`, `management.test.ts`, `date-validation.test.ts`, `lookup/declarations.test.ts`, `lookup/lookup.test.ts`; existing accounting/reporting/year-end/FX/budget tests remain in the full suite. Full deployed API contracts, signed-in lifecycle/sharing/email UI, every lookup context and a memory soak still require execution.

## Originality and benchmark review

The two user screenshots were reference material only. The existing LinkBooks application shell, component/theme tokens, independent report centre structure, builder and workflow were used. No competitor markup, proprietary assets or layouts were copied. This is an author originality review; no formal external IP opinion is claimed. `reporting-benchmark-2026-11-02.md` records official-documentation research across the requested products, with no unsupported hands-on parity claims.

## Release gates and continuation

The criterion-by-criterion scorecard is `reporting-acceptance-scorecard.md`; the exact field inventory is `reporting-lookup-inventory.md`; defects/risks are `reporting-defect-register.md`. PARTIAL/FAIL/BLOCKED are not counted as passed.

Next implementation order: (1) advanced filter/dimension/calculated-column/accounting display controls with posted-ledger SQL and tests; (2) include saved custom, budget, ageing, forecast and KPI sections in immutable pack capture/export; (3) firm-shared reusable templates, full branding, dashboard sharing, report history, model/schedule paging; (4) complete authorized browser→API→DB matrix and API contract negatives; (5) verified provider delivery/attachment/bounce tests; (6) deployed 25-concurrent P95 and memory soak; (7) independent accounting/security review and GitHub CI/approvals; (8) only then merge main and verify exact resulting SHA. Do not restart or discard the implemented branch.

## GitHub integration

Pending branch commit/push and draft PR creation at report generation. This section will be updated with actual references. Main is not merged; production certification remains withheld under the user's mandatory acceptance and merge conditions.
