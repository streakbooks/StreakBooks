# CRM — Contact people, server search and calendar coverage

**Date:** 2026-11-09  
**Scope:** LinkBooks CRM; company-specific Supabase data; no new database schema, migrations, service integrations or accounting postings.  
**Source baseline:** `main` after PR #220 (`cbc1fead`).  
**Goal:** Address UI-to-backend wiring gaps and remove misleading first-page-only search in core CRM lists.

## Verified distinctions

| Signal | Value | Meaning |
| --- | --- | --- |
| CRM navigation | 20/20 declared sections | Route definitions, **not** full functional completeness |
| New batch deliverables | Source code committed in CRM search/people branch | Does **not** prove runtime behavior |
| Unit / typecheck / browser | Not run using this remote GitHub connector | Must be verified in a checked-out workspace |
| Live user acceptance | Pending | Separate from merged code |
| Production deployment | Unverified | Branch merge does not prove a Vercel deployment |
| Supabase SQL schema changes | None | Search uses existing RLS-protected tables |

## Current batch scope (code implemented, live QA pending)

| ID | Workstream | Change | Acceptance evidence still required |
| --- | --- | --- | --- |
| CRM-S02-01 | CRM Contacts | Actual person-level customer directory instead of reused account table | Person name, email, phone, account link, primary flag, tenant restriction |
| CRM-S02-02 | Contacts integration | Route `/crm/contacts` to dedicated customer-person page | Back/forward, role visibility, customer profile deep link |
| CRM-S02-03 | Leads search | Server-filter by number, name, organization, email | Punctuation and LIKE escaping; >100 leads |
| CRM-S02-04 | Leads pagination | Stable timestamp+ID ordering and 50-row pages | Next/previous and non-default status filters |
| CRM-S02-05 | Opportunities search | Server-filter name/number and pipeline | Cross-pipeline isolation and 100+ deals |
| CRM-S02-06 | Opportunities pagination | Stable ordering, 50-row list/Kanban pages | Selected pipeline, stage transitions, next/previous |
| CRM-S02-07 | Activities search | Server-side subject lookup with bounded page retrieval | Searches after >100 activities, no cross-company data |
| CRM-S02-08 | Tasks | Open/all/overdue and task-kind filters | Task-only results; due-before timestamp; completed preserved |
| CRM-S02-09 | Calendar | Queries selected month's meetings; 500-row cap declared | DST/month edge dates and proper month navigation |
| CRM-S02-10 | Database security read | Existing CRM/Contacts schema and RLS flag/policy presence inspected | True authenticated 2-company RLS tests still pending |
| CRM-S02-11 | Customer pipeline FX safety | Group open opportunity value by actual currency rather than adding raw minor units | Mixed USD/EUR deals, invalid currency, multi-company views, and all reporting screens |

## All CRM sections — remaining work register

| Section | Current stage | Critical outstanding |
| --- | --- | --- |
| Overview | Partial | Date filters, dashboard layouts, signed-in tests |
| Leads | Partial, upgraded this batch | Full lead list E2E, qualification workflows, bulk actions, anti-spam public lead intake |
| Opportunities | Partial, upgraded this batch | Editable deal detail, stage history proof, product lines and quote authorization |
| Pipelines | Partial | Admin permissions and Kanban drag/keyboard E2E |
| Accounts | Improved, FX-safe pipeline by currency | Customer 360 view, hierarchy, enterprise aggregation and independent FX conversion policy |
| CRM Contacts | Improved this batch | Enterprise-scale person search/pagination, person-level history and consent controls |
| Activities | Improved this batch | Full activity timelines, reminders, reassignment |
| Tasks & Follow-ups | Improved this batch | Automated SLA escalations, recurring tasks, reminders |
| Calendar & Meetings | Improved this batch | External calendar authorization, availability, attendee invitations, >500 meeting months |
| Communications | Blocked by design | Approved OAuth providers, secure email sync/sends, suppression lists, audit |
| Quotes & Proposals | Partial | Production verified quote-to-invoice lifecycle, approval/proposal versioning |
| Campaigns & Sources | Partial | Consent-led sending, attribution and campaign ROI |
| Products & Price Lists | Read-only shared catalogue | Price lists, deal line items, discounts and tax consistency |
| Sales Forecasting | Partial | Multi-currency snapshot modeling and comparative scenarios |
| Customer Relationships | Partial | Customer health, retention, renewal automation |
| Automation | Fail-closed | Reliable permissioned background rule engine with idempotency |
| CRM Reports | Partial | Saved reports, export controls, audit and scheduling |
| Team & Territories | Partial | Rule-based allocation, targets, territory quotas |
| Imports & Exports | Fail-closed | CSV schema validation, role checks, rate limits and audit |
| CRM Settings | Partial | Admin UX, custom fields, safe notification and provider configuration |

## Mandatory test plan before production acceptance

1. `npm.cmd run check:modules`, `npm.cmd run check:navigation`, `npm.cmd run check:ui` from a clean checkout.
2. TypeScript typecheck, lint, formatting and `npx vitest run src/lib/crm`; **do not initiate GitHub CI** per owner directive.
3. Signed-in lead search with special characters `% _ , ( ) " \\`, more than 100 records and open-only vs all statuses.
4. Opportunity search across default/non-default pipelines, more than 50 results and keyboard stage updates.
5. Activity task filtering across call, meeting and task rows, completed tasks, and overdue timestamp behavior.
6. Calendar boundary checks in two timezones and a month with meetings both before/after daylight-saving transitions.
7. CRM Contacts profile links and proof supplier-only people never appear, including two-company signed-in RLS negative tests.
8. Existing Contacts master, Sales quote/invoice and GL remain unchanged by CRM reads.
9. Verify responsive layout, errors/empty/loading states, contrast, keyboard, deep links and browser back.
10. Review deployment build and signed-in staging/production evidence before calling the CRM complete.

**Unverified means unverified.** A merged PR changes source code but does not establish production acceptance.

## Live read-only database verification (2026-11-09)

- Confirmed `crm_leads`, `crm_opportunities`, `crm_activities`, `contacts`, and `contact_people` expose the expected columns and have enabled RLS with policies.
- Verified the SQL definitions of sampled CRM RPCs, including `complete_crm_activity`, `get_crm_settings`, `find_crm_duplicate_leads`, `upsert_crm_activity`, pipeline administration, and stage moves. They call `private.crm_require_permission` either directly or through their authorized overloads.
- `private.crm_require_permission` verifies `auth.uid()`, `is_company_member(company_id)` and `has_company_permission(company_id, permission)`. This is a guard inspection, **not** a two-company impersonation or adversarial RPC test.
- Supabase Security Advisor still flags authenticated `SECURITY DEFINER` functions among broader project findings; direct RPC grants require a complete access review. See [Supabase Security Advisor 0029](https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable).
- No SQL permissions, migrations, RLS policies, production data or third-party connectors were changed in this batch.

## Currency correctness boundary

- Customer Accounts pipeline now displays separate original-currency totals. Never add minor-unit amounts of different currencies or label unconverted sums as the company's base currency.
- Other CRM dashboards and forecasting RPCs still need a full multi-currency/FX snapshot audit; do not interpret their aggregates as verified consolidated accounting values.

## Critical blockers outside this batch

- Secure production outbound email, calendar providers and consent workflows require external OAuth connections and tested refresh/revocation.
- Public intake and bulk exports must stay disabled until tenant isolation, spam prevention, audit and rate limiting pass.
- Automation must not run on real company data until the workflow runner, queuing, retries and authorization tests are complete.
- Missing CRM-to-accounting advanced functionality must reuse existing shared Contacts, Products, Sales, Banking and reports; never duplicate GL postings.
- Full 20-section signed-in test evidence is still required before production-ready status.
