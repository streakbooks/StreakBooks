# LinkBooks CRM — Technical architecture (CRM-01 / CRM-02)

## Stack

- Frontend: React, TypeScript, TanStack Router/Query/Start, Vite  
- Backend: Supabase PostgreSQL, Auth, RLS, SECURITY DEFINER RPCs  
- AuthZ: `requireSupabaseAuth` server functions + `assertCompanyPermission` + RLS  
- UI: `ListWorkspace` / `RecordWorkspace`, module registry, LinkBooks themes  

## Module layout

```
src/lib/crm/           # sections, types, mappers, server functions
src/screens/crm/       # overview, leads, opportunities, …
src/routes/_authenticated/crm/
src/components/crm/    # CrmSubnav, shared widgets
supabase/migrations/20261109120000_crm_foundation.sql
docs/crm/              # PRD, gap analysis, this doc
```

## Data model (foundation)

Organisation-scoped tables (prefix `crm_`):

| Table | Purpose |
| --- | --- |
| `crm_settings` | Enablement, prefixes, stale days |
| `crm_lead_sources` | Attribution catalogue |
| `crm_pipelines` | Named pipelines per company |
| `crm_pipeline_stages` | Ordered stages + probability + closed flags |
| `crm_leads` | Pre-customer records |
| `crm_lead_events` | Lead audit trail |
| `crm_opportunities` | Deals linked to `contacts` |
| `crm_opportunity_stage_history` | Stage moves |
| `crm_activities` | Calls, meetings, tasks, notes |

**Reuse:** `contacts`, `contact_people`, `sales_quotes`, `products`, notifications.  
Leads may optionally `contact_id` after conversion; never invent a second customer table.

## Mutation pattern

1. Client calls TanStack server function.  
2. Server asserts membership + permission.  
3. SECURITY DEFINER RPC performs validation + write + event row.  
4. SELECT under RLS for lists (authenticated GRANT SELECT only).  
5. Direct INSERT/UPDATE/DELETE revoked from `authenticated`.

## Security

- Default deny RLS; membership AND `crm.*` permission.  
- Cross-company FKs composite where needed (`company_id`, `id`).  
- Public lead forms / webhooks deferred; spam protection required before enablement.  
- Exports gated by `crm.export`.

## Feature enablement

`crm_settings.enabled` defaults false. Admins enable CRM; enabling seeds a default Sales pipeline when none exist.

## Batch delivery

Incremental PRs into `main`. Incomplete surfaces use `batch` metadata and fail-closed actions — never fake KPIs.
