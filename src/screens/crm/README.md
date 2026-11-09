# CRM module

- Module id: `crm`
- Path: `/crm`
- Batches: CRM-01 (docs) through CRM-14 (production readiness)
- Foundation migration: `supabase/migrations/20261109120000_crm_foundation.sql`

## Wired in this foundation

- Navigation + `MODULE_REGISTRY`
- Settings enablement (RPC + UI)
- Dashboard KPIs from live aggregates
- Leads CRUD, assign, convert (creates `contacts` row; optional opportunity)
- Opportunities list/Kanban stage moves
- Pipelines (default Sales pipeline seed)
- Activities / tasks / meetings

## Fail-closed until later batches

Accounts overlays, communications sync, quote bridge UI depth, automation, AI actions, campaigns, forecasting reports, team/territories, imports — routes exist with honest empty states.

## Checks

```powershell
npm.cmd run check:modules
npm.cmd run check:ui
npm.cmd run check:navigation
npm.cmd run typecheck
```
