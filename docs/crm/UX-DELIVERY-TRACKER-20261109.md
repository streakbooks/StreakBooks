# LinkBooks CRM — UI/UX delivery and gap register (2026-11-09)

**Repository:** `linkbusinessadvisory/LinkBooks`  
**Feature branch:** `feature/crm-ui-ux-navigation-validation-20261109`  
**Base:** `main` as inspected on 2026-11-09  
**Scope:** all 20 existing CRM navigation sections; shared Contacts, Sales and Products remain authoritative.

## Accurate progress policy

- **Code authored** means a change is committed on the feature branch. It is not proof the deployed product works.
- **Verified** requires a real test result and evidence (test output, signed-in browser walkthrough, isolated Supabase RLS proof).
- **Merged**, **migrated**, and **deployed** are independent statuses; none can be inferred from an authored file.
- Never calculate an overall completion percentage from incomparable counts or mark a gated UI as functional.
- No new SQL migration or third-party provider activation is included in this UI/UX batch.

## Batch-level completion ledger

| ID | Deliverable | Branch code | Test / live QA | Acceptance |
| --- | --- | --- | --- | --- |
| UX-01 | Compact, responsive grouped CRM navigation across all 20 section links | Authored | Pending | Active group, keyboard focus, Ctrl/Cmd-click, browser back/forward, role filtering |
| UX-02 | Shared semantic status badge using LinkBooks theme tokens | Authored | Pending | Won, lost, lead, task statuses readable on light/dark themes |
| UX-03 | Lead form identity, email and precise monetary validation | Authored | Pending | Invalid input cannot be silently saved as zero |
| UX-04 | Fail-closed lead duplicate-check error state and explicit acknowledgement | Authored | Pending | Failed or pending duplicate check cannot create the lead |
| UX-05 | Lead search on loaded rows and linked lead names | Authored | Pending | Search matches number/name/email, clear loaded-only disclosure |
| UX-06 | Customer selector in opportunity creation using shared Contacts master | Authored | Pending | New customer-linked opportunity can create a Sales quote where authorized |
| UX-07 | Active pipeline selector for list and Kanban | Authored | Pending | Non-default pipelines are visible, columns and closed deals stay in scope |
| UX-08 | Opportunity amount validation and error states | Authored | Pending | Invalid / negative values blocked; stale and failed queries visible |
| UX-09 | Activities linked to either leads or opportunities; task filter corrected | Authored | Pending | Save and reload association; unrelated kinds absent from task view |
| UX-10 | Required meeting time, date checks, month calendar with day drilldown | Authored | Pending | Meeting appears in correct local day; DST/mobile/accessibility |
| UX-11 | CRM quote navigation stays in-app and preserves browser history | Authored | Pending | Draft/reuse opens correct Sales quote, no duplicate |
| UX-12 | CRM Contacts route has its own accurate title and scope description | Authored | Pending | Does not falsely imply full person directory exists |
| UX-13 | CRM overview call to action describes its actual destination | Authored | Pending | "Manage leads" goes to lead workspace |
| UX-14 | Unit-test source added for lead validation, deal validation, status semantics | Authored | **Not executed here** | Tests pass in actual LinkBooks workspace |

**Branch code delivery:** 14/14 defined items authored. **Functional verification:** 0/14 proven by this remote GitHub-only review.  
**GitHub PR/merge:** to be recorded separately when opened; **Supabase migration/deployment:** not part of this branch.

## All 20 menus — truthful capability coverage

| CRM section | Verified repository capability | Remaining acceptance |
| --- | --- | --- |
| Overview | Database-backed KPIs and links | Date filters, KPI charting, live verification |
| Leads | Lead CRUD, conversion, duplicate finder; validation improvements on this branch | Full server search/pagination, bulk actions, account matching E2E |
| Opportunities | Create, pipeline-stage change, board/list, reopen; this branch improves multi-pipeline + customer linking | Editable deal details, custom field depth, loaded-record pagination |
| Pipelines | Configuration RPCs and management screen | Signed-in drag/drop, admin-only edit, stage history QA |
| Accounts | Shared Contacts overlay | Account 360°, hierarchy, CRM attribute edits |
| CRM Contacts | Shared customer overlay, link to Contacts | True people directory, person-level interactions |
| Activities | Activity create/complete, this branch links to opportunities | Full contact-level association, paginated timeline, notes |
| Tasks & Follow-ups | Open task records, create/complete | Recurrence, reminders, SLAs, assignment and overdue escalation |
| Calendar & Meetings | Meeting records + this branch adds month view | Full-range pagination, invitations, bidirectional sync, availability |
| Communications | Provider-off policy | Approved OAuth provider, consent, send/reply, delivery and abuse controls |
| Quotes & Proposals | Opportunity-to-Sales draft bridge | Complete sales order/quote/invoice/browser E2E, draft edit and approvals |
| Campaigns & Sources | Campaign create/list with existing CRM records | Multi-touch attribution, campaign automation |
| Products & Price Lists | Read-only shared catalogue bridge | Deal product lines, pricing sync and discounts |
| Sales Forecasting | Existing forecast reporting foundation | Multi-currency FX, historical snapshots, scenario reports |
| Customer Relationships | Read-only invoice/payment visibility | Renewal/onboarding/retention management |
| Automation | Fail-closed policy UI | Durable triggers/actions, consent, retries, scheduling, execution logs |
| CRM Reports | Existing CRM KPIs and forecast report | Report builder, exports, saved filters, per-role audit |
| Team & Territories | Team workload and territory record management | Assignment rules, targets, reassignment safeguards |
| Imports & Exports | Fail-closed policy UI | Secure CSV mappings, job lifecycle, export authorization/audit |
| CRM Settings | CRM enablement and security-gated settings | Advanced preferences and public intake after anti-abuse review |

## Required validation before accepting/merging this branch

1. Run changed-file formatting and lint checks.
2. Run `npm.cmd run typecheck` (or repository's verified equivalent).
3. Run `npm.cmd run check:modules`, `check:navigation`, `check:ui`.
4. Run `npx vitest run src/lib/crm` locally (do not trigger GitHub CI).
5. Browser: test all 20 routes at desktop, tablet and mobile sizes.
6. Browser: create lead; duplicate lookup success/failure; negative/invalid amount; perform lead conversion.
7. Browser: create contact-linked opportunity; select non-default pipeline; move stage by mouse and keyboard; reuse Sales quote draft.
8. Browser: create lead-linked and deal-linked activities; verify task-only list; check month view and timezones.
9. Authenticated multi-company RLS checks and read-only/non-admin permission checks.
10. Signed-in validation of quote URL, browser back/forward, hard reload and Ctrl/Cmd-click.
11. Evidence of Vercel staging/production deployment must be separately recorded.
12. Do not merge when critical regression or failed tenancy/security tests are unresolved.

## Known remaining high-risk work (not silently marked complete)

- **Security and QA:** multi-company isolation, permission escalation, direct RPC tampering, verified browser E2E; never bypass.
- **Communications:** email sending and two-way sync require OAuth scopes, explicit authorization, consent, provider retries, webhook validation and emergency revocation.
- **Automation:** durable workflow engine, execution history, re-entrancy guards, approvals and idempotency.
- **Public intake:** bot defense, abuse limits, validation, consent, fraud controls.
- **Import/export:** controlled CSV pipeline and auditable exports; current blocked UI remains intentional.
- **Accounting correctness:** deal-to-quote price provenance, quote-to-invoice uniqueness and posted journal reconciliation remain separate cross-module acceptance checks.
- **Search and scale:** server-side filtering, stable pagination and 10k+ deal/lead performance; current local list search is explicitly limited to loaded rows.
- **True CRM customer 360:** account/contact hierarchy, person-level timeline, communication consent and retention workflows.
- **Internationalization and accessibility:** timezone/DST cases, locale/decimal parsing, keyboard Kanban, contrast/a11y audit.

## Next implementation batches

1. **CRM UX QA:** local typecheck, formatting, unit tests and signed-in browser verification. No GitHub CI per existing user instruction.
2. **CRM data depth:** secure deal edit/detail, customer 360, person-level activity, paginated search and complete record navigation.
3. **CRM workflows:** reminders/recurrence, secure communication providers, public lead capture and automation with fail-closed defaults.
4. **Enterprise reports:** exports, forecasting snapshots, campaign attribution, territory routing and revenue reconciliation.
5. **Security release gate:** complete live E2E, tenant isolation, permissions, performance, staging/production verification.

**Nothing in this document asserts that these remaining workflows are implemented or deployed.**
