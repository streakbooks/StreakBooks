# Workspace and workflow spec

## Shared workspaces

### List workspace

Compose `ListWorkspace` with:

- module title / description / breadcrumbs
- role-aware primary create action (real backend only)
- `ModuleSubnav` or native tab strip when the module owns sections
- `DataTableToolbar` / saved views / selection bar when the domain supports them
- optional insight rail via `WorkspaceInsights` (permission-aware, ledger/link facts only — no fabricated AI)

### Record workspace

Compose `RecordWorkspace` with action header, status meta (`StatusBadge`), related tiles, form/tabs, attachments/timeline, posting journal links where authorised, and `WorkspaceInsights` for related native links + ledger-backed facts.

## State machines

Document statuses remain authoritative in Postgres. UI maps presentation only via `status-badge` / `resolveDomainStatus`. Invalid transitions must be rejected server-side; UI never invents progress.

## Permissions

Every mutation goes through existing `requireSupabaseAuth` server functions + RLS. Scaffolded modules keep actions **disabled** until contracts exist.

## Company switch

Route changes and company switches must invalidate sensitive caches (existing AppShell / query client patterns). No cross-tenant flashes.

## ModuleDefinition

See `src/lib/modules/types.ts` and `registry.ts`. Router remains source of truth for routability; registry classifies experience contracts for inheritance and checks.
