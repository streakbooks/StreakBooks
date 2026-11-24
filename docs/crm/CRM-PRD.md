# StreakBooks CRM — Product requirements (CRM-01)

## Vision

Enterprise CRM inside StreakBooks that manages the customer lifecycle from first inquiry through qualification, pipeline, quotation, invoicing (via existing Sales), and ongoing relationships — without duplicating Contacts or the accounting engine.

## Non-negotiables

1. Real persistence, authorization, validation and error handling on every exposed action.  
2. One customer identity: `public.contacts` remains the master.  
3. CRM never posts journals; accounting only via authorised Sales/Purchases/Accounting paths.  
4. Forecast / weighted pipeline metrics are labelled separately from realised revenue.  
5. Fail closed: incomplete surfaces stay disabled or gated until backends + RLS exist.  
6. Original StreakBooks UI; competitors are benchmarks only.  
7. Organisation isolation via RLS + `has_company_permission`.

## Personas & roles (mapped to permissions)

| Role intent | Typical company role | Permissions |
| --- | --- | --- |
| CRM Administrator | owner, admin | `crm.admin`, all `crm.*` |
| Sales Manager | admin, accountant (optional) | view, manage leads/opps, reports, assign |
| Salesperson | staff | view, leads, opportunities, activities |
| Sales Operations | admin | import/export, settings assist |
| Marketing | staff / admin | campaigns (later), view |
| Analyst | read_only | `crm.view`, `crm.reports.view` |

## Core objects

- **Lead** — pre-customer inquiry; converts once to a contact (+ optional opportunity).  
- **Pipeline / Stage** — configurable; probability drives weighted value.  
- **Opportunity (Deal)** — open revenue possibility linked to a contact.  
- **Activity / Task** — CRM interaction; may link lead, opportunity and/or contact.  
- **Campaign / Source** — attribution (later batches deepen).  
- **CRM Settings** — enablement, prefixes, stale-deal thresholds.

## KPI formulas (dashboard)

| KPI | Formula |
| --- | --- |
| Total leads | Count leads where `status NOT IN ('converted','disqualified')` OR all non-archived per filter |
| New leads | Created in selected date range |
| Qualified leads | `status = 'qualified'` |
| Unassigned leads | `owner_user_id IS NULL` and open |
| Active opportunities | `status = 'open'` |
| Pipeline value | Sum `amount_minor` of open opps (doc currency; report later converts) |
| Weighted pipeline | Sum `amount_minor * stage.probability_pct / 100` for open opps |
| Won / Lost | Count opps with `status` won/lost in range |
| Win rate | Won / (Won + Lost) in range |
| Sales conversion rate | Converted leads / (Converted + Disqualified + still open cohort) — documented in UI |
| Expected deal value | Alias of weighted pipeline for open set (not accounting revenue) |
| Overdue follow-ups | Activities `due_at < now()` and not completed |
| Upcoming meetings | Activities kind meeting in next 7 days |
| Forecast revenue | Sum weighted amounts with expected close in forecast period |
| Stagnant deals | Open opps with `stage_entered_at` older than settings threshold |

Currency: store deal amounts in deal currency + minor units; dashboard shows company base currency only when FX conversion is available — otherwise show native totals with currency label.

## Acceptance scenarios (tracked across batches)

See master directive §23. CRM-02/03 must prove: create lead persists; assign; stage change; convert without duplicate contact when linked; unauthorized denied; cross-company isolation via RLS.

## Out of scope for CRM-02 foundation

Email send, OAuth calendar sync, full automation engine, AI merge execution, HubSpot bidirectional sync — reserved for later batches with App Store certification.
