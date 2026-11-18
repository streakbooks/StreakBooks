# Route and interaction inventory

**Status:** Wave 0 baseline — generated from repository sources on 2026-11-07.  
**Authority:** `src/lib/nav.ts`, `src/lib/modules/registry.ts`, `src/routes/`, `docs/ui/PAGE-COVERAGE.md`.  
**Truth labels:** `existing-working` | `partial` | `missing` | `not-yet-verified`.

This inventory classifies surfaces. It does **not** mark screens DONE under the finished-screen acceptance contract.

## Sidebar modules (24)

| Module | Path | Subnav / tabs | Screen type | Premium status | Owner notes |
| ------ | ---- | ------------- | ----------- | -------------- | ----------- |
| Dashboard | `/` | — | dashboard | partial | Attention widgets exist; full configurable widget DoD not-yet-verified |
| Banking | `/banking` | Accounts, Transactions, Reconcile, Cash coding, Transfers, Bank documents, Rules, Import, Feeds | list/record | partial | Native ModuleSubnav; posting rules preserved |
| Sales | `/sales` | Overview…Settings (`SALES_SECTIONS`) | list/record | partial | ModuleSubnav |
| Purchases | `/purchases` | Overview…Settings (`PURCHASES_SECTIONS`) | list/record | partial | ModuleSubnav |
| Expense Management | `/expense-management` | 16 sections | list/record | partial | Dedicated subnav |
| Contacts | `/contacts` | `?view=` + detail `?tab=` | list/record | partial | Native tab keyboard handlers |
| Products & Services | `/products-services` | — | list | partial | |
| Files | `/files` | — | list | partial | |
| Accounting | `/accounting` | `?tab=` (13) | tool | partial | |
| Budgets | `/budgets` | detail `/$budgetId` | list/record | partial | |
| Fixed assets | `/fixed-assets` | `?tab=` (6) | list | partial | |
| Payroll | `/payroll` | 8 sections | list/record | partial | Basic Global Payroll disclaimer |
| Reports | `/reports` | 11 reporting tabs | report | partial | |
| Tax | `/tax` | `?tab=` (7) | tool | partial | |
| Accountant | `/accountant` | `?tab=` (7) | tool | partial | |
| Firm | `/firm` | invite token route | dashboard | partial | |
| Advisors | `/advisors-admin` | 12 sections | list/record | partial | |
| Advisors portal | `/advisors-portal` | 6 sections | portal | partial | Portal isolation required |
| Action Center | `/notifications` | — | list | partial | |
| App Store | `/app-store` | 16 sections | list/record | partial | |
| Developer | `/developer` | 14 sections | tool | partial | |
| AI Assistant | `/ai-assistant` | — | tool | partial | |
| Settings | `/settings` | section registry | settings | partial | |
| Help | `/help` | — | tool | partial | |

## Non-sidebar authenticated / public (discovered)

| Area | Paths | Status |
| ---- | ----- | ------ |
| Platform / superadmin | `/platform`, billing, automation, operations | partial / not-yet-verified |
| Profile, onboarding, imports, projects, recurring journals | various | partial |
| Auth / MFA / SSO / password | `/auth*`, forgot/reset | partial |
| Pricing | `/pricing*` | partial |
| Customer portal | `/portal/*` | partial |
| Advisors marketing + tokens | `/advisors*` public | partial |
| Documents print/branding | `/documents/*` | partial |

## Shared interaction primitives (reuse)

| Primitive | Path | Status |
| --------- | ---- | ------ |
| AppShell | `src/components/layout/AppShell.tsx` | existing-working |
| ModuleSubnav | `src/components/common/ModuleSubnav.tsx` | existing-working (3 modules) |
| PageHeader / Empty / Loading / Error | `src/components/common/states.tsx` | existing-working |
| StatusBadge | `src/components/common/StatusBadge.tsx` | existing-working |
| DataTableToolbar | `src/components/common/data-table-toolbar.tsx` | existing-working |
| ListWorkspace / RecordWorkspace | `src/components/workspace/*` | partial (new Batch 1) |
| ModuleDefinition registry | `src/lib/modules/*` | partial (new Batch 1) |

## Verification evidence

- `npm run audit:ui` → `docs/ui/PAGE-COVERAGE.md` (source action inventory)
- `npm run check:navigation` — 24 modules + native link contracts
- `npm run check:modules` — registry ↔ nav ↔ docs (Batch 1)

Update this file whenever a module merges to `main`.

## Purchase requisitions — 18 November 2026

`/purchases/requisitions` is registered under the existing Purchases module using
`ListWorkspace` and `PURCHASES_SECTIONS`. It supports tenant-scoped paginated search,
atomic draft creation/editing, independent approval/rejection, revision/cancellation,
and approved-to-PO conversion. Source implementation is complete; manual device,
accessibility, authenticated staging and production acceptance remain unverified.
See `docs/purchases/REQUISITIONS_IMPLEMENTATION.md` for the new-surface checklist.
