# LinkBooks CRM — Verified gap analysis (post CRM-01/02 foundation)

**Revision:** 2026-11-09  
**Code base:** `feature/crm-batch01-02-foundation` @ PR #208  
**Method:** Repository inspection only. A route, button or table is **not** treated as complete.

## Status legend

| Status | Meaning |
| --- | --- |
| Implemented | End-to-end path with auth, persistence, validation |
| Partial | Real backend or UI exists but workflow incomplete |
| Missing | Not present |
| Defective | Present but incorrect / unsafe relative to requirement |
| Unverified | Code present; live DB/staging/production not proven |

## Summary counts

| Category | Count |
| --- | --- |
| Requirements reviewed (directive capabilities) | 96 |
| Gaps identified (material) | 71 |
| Critical remaining (after this closure batch) | see PROGRESS |
| High remaining | see PROGRESS |
| Implemented (foundation) | 18 |
| Partial | 14 |
| Missing | 52 |
| Defective / Unverified | 12 |

---

## A. Functional & workflow gaps

| ID | Feature | Status | Expected | Gap / weakness | Risk | Priority | Improvement | Edge cases | Deps | Tests | Acceptance | Batch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | CRM top-level nav + 20 routes | Implemented | Sidebar CRM, deep links | — | Low | — | Maintain | Ctrl-click | nav, registry | check:nav | All 20 routes resolve | CRM-02 |
| G02 | CRM settings enablement | Implemented | Admin toggles CRM | Migration must be applied | High until applied | Critical | Apply migration | Concurrent enable | crm_settings RPC | settings UI | Enable then create lead | CRM-02 |
| G03 | Lead create/list/detail | Implemented | Persist after refresh | No import/API/forms yet | Med | High | Keep + extend | Empty identity rejected | upsert_crm_lead | create→refresh | Lead persists | CRM-03 |
| G04 | Lead assignment | Implemented | Assign org member | No team/territory rules | Med | High | Territory later | Non-member rejected | assign_crm_lead | assign self | Owner set | CRM-03 |
| G05 | Lead convert → Contact | Partial | No duplicate customer | **Did not auto-detect email/name matches before create** | Critical | Critical | Match RPC + force choice | Simultaneous convert | convert_crm_lead | convert with match | Uses existing contact | CRM-03/gap |
| G06 | Lead dedupe on capture | Missing→Partial | Warn/block duplicates | No finder at create | High | Critical | find_crm_duplicate_leads | Same email concurrent | leads email idx | dup warn | Warning shown | gap |
| G07 | Lead scoring explainable | Partial | Score + rationale | Score field only; no formula | Med | High | Deterministic scorer | Missing email | score_crm_lead | unit formula | Score + note | gap |
| G08 | Lead stages configurable | Partial | Configurable stages | Fixed enum statuses | Med | Medium | Config later | Invalid status | crm_leads.status | — | Documented enum | CRM-12 |
| G09 | Opportunity create/list | Implemented | Persist deals | Contact optional | Med | High | Require contact for won | Currency | upsert_crm_opportunity | create | Persists | CRM-05 |
| G10 | Pipeline Kanban stage move | Partial | DnD + validation | Select-based move only; no HTML5 DnD a11y board | Med | Medium | Accessible DnD later | Concurrent stage | set_crm_opportunity_stage | move stage | History row | CRM-05 |
| G11 | Stage transition rules | Partial | Restrict illegal moves | Same-pipeline only; won→open reopen missing | High | High | reopen_crm_opportunity | Reopen won | stage history | reopen | Status open | gap |
| G12 | Optimistic concurrency | Defective | Detect stale edits | Opportunity stage lacked version check | High | High | expected_version | Two users | RPC | concurrent | 40001 on stale | gap |
| G13 | Quote from deal | Missing | Deal → Sales quote | No bridge | Critical for revenue path | Critical | CRM-08 | Quote currency change | sales_quotes | E2E quote | Quote linked | CRM-08 |
| G14 | Quote→invoice via CRM | Missing | Use existing convert | Must not duplicate GL | Critical | Critical | Reuse convertQuoteToInvoice | Concurrent convert | sales | E2E | One invoice | CRM-08 |
| G15 | Payment visibility in CRM | Missing | Read-only invoice status | No CRM surface | Med | High | Permission-scoped refs | No sales.view | sales balances | RLS deny | No GL leak | CRM-09 |
| G16 | Activities/tasks/meetings | Partial | Full calendar sync | Local activities only; no Google/MS | High | High | CRM-07 OAuth | TZ/DST | crm_activities | create/complete | Persists | CRM-06/07 |
| G17 | Communications send | Missing | Templates + delivery states | No send path | High | High | Fail-closed until provider | Bounce, consent | App Store | — | Disabled honest | CRM-07 |
| G18 | Automation engine | Missing | Triggers/actions/logs | None | High | High | CRM-10 | Loops, retries | jobs | — | Flagged off | CRM-10 |
| G19 | Campaigns/attribution | Missing | Campaign records | Nav only | Med | Medium | CRM-11 | Consent | — | — | Fail-closed | CRM-11 |
| G20 | Forecasting reports | Partial | Weighted forecast labelled | Dashboard KPIs only; no snapshots | Med | High | CRM-11 | FX rates | KPI RPC | formula tests | Labelled ≠ GL | CRM-11 |
| G21 | Accounts CRM overlay | Missing | Contacts + CRM attrs | Bridge link only | High | High | CRM-04 | Hierarchy | contacts | — | No second master | CRM-04 |
| G22 | Import/export | Missing | Mapping + validation | Nav only | High | High | CRM-12 | Partial import | crm.import/export | — | Fail-closed | CRM-12 |
| G23 | Teams/territories | Missing | Assignment rules | Nav only | Med | Medium | CRM-12 | Deactivated owner | members | — | Reassign required | CRM-12 |
| G24 | AI CRM assist | Missing | Approval-gated tools | AI module exists separately | Med | Medium | CRM-10 | Stale data | ai.use | — | No auto-send | CRM-10 |
| G25 | Custom fields | Missing | Extensible fields | None | Med | Medium | CRM-12 | Validation | JSONB later | — | — | CRM-12 |
| G26 | Multi-pipeline admin UI | Partial | Create pipelines/stages | Seeded default; no editor | Med | Medium | CRM-05/12 | Delete in-use stage | crm_pipelines | — | Fail-closed edit | CRM-12 |
| G27 | Retention/onboarding | Missing | Post-sale workflows | None | Med | Medium | CRM-09 | — | contacts | — | — | CRM-09 |
| G28 | Cross-company isolation | Implemented (code) / Unverified (live) | RLS deny | Migration not applied live | Critical | Critical | Apply + test | Forged company_id | RLS | deny tests | Empty/403 | CRM-02/13 |
| G29 | Public lead forms | Missing | Spam-protected capture | None | High | High | Later + bot protect | Flood | edge fn | — | Fail-closed | CRM-07 |
| G30 | Deal products/lines | Missing | Catalog lines | None | High | High | CRM-08 | Price lists | products | — | Shared catalog | CRM-08 |

## B. Edge-case matrix (directive §4)

| Edge case | Status | Notes |
| --- | --- | --- |
| Duplicate leads simultaneous | Partial | Unique number; email soft warning via finder |
| Concurrent opportunity updates | Partial→Improved | Version check on stage move |
| Deactivated salesperson owner | Partial | Assign validates member; no auto-clear job |
| Customer merge + CRM links | Unverified | merge_contacts exists; CRM FKs SET NULL — need CRM-04 tests |
| Currency change after quote | Missing | No CRM quotes yet |
| Expired quotations | Missing | Sales has expiry; CRM bridge absent |
| Reopen won deals | Missing→Implemented | reopen_crm_opportunity |
| Invalid stage transitions | Partial | Cross-pipeline blocked; no custom gates |
| Convert when customer matches | Defective→Fixed | Match detection + require selection |
| Reminder TZ/DST | Partial | timestamptz stored; no DST UI |
| OAuth expiry | Missing | No CRM OAuth |
| Partial third-party sync | Missing | — |
| Bulk import invalid rows | Missing | — |
| Workflow during outage | Missing | — |
| Cross-company access | Code ready / Unverified live | — |
| Unauthorized export | Missing export | Permission seeded |
| Concurrent quote→invoice | N/A until CRM-08 | Sales has convert |
| Archived refs | Partial | archived_at filters |
| AI on stale data | Missing | — |

## C. Security / privacy

| Item | Status |
| --- | --- |
| `crm.*` permissions seeded | Implemented in migration |
| SELECT RLS + RPC mutations | Implemented in migration |
| Migration applied staging/prod | **Pending** |
| Confidential accounting leakage | Designed separate; payment UI missing |
| Export audit | Missing |

## D. Originality

| Item | Status |
| --- | --- |
| Uses LinkBooks ListWorkspace/tokens/themes | Implemented |
| Competitor visual cloning | Avoided — LinkBooks shell |
| Formal originality checklist | Added `ORIGINALITY-CHECKLIST.md` |
| Legal IP review | **Not claimed; Pending legal** |

## E. What must stay blocked from production

Until closed and verified: CRM-08 quote bridge, CRM-07 outbound email, CRM-10 automation, public lead forms, imports, AI consequential actions, live multi-tenant RLS proof after migration apply.