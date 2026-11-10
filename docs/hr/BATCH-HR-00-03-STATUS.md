# Batches HR-00 … HR-03 — status

## Completed locally (code + docs)

| Batch | Deliverable | Evidence |
|-------|-------------|----------|
| HR-00 | Audit, PRD, 12-competitor gap matrix, architecture, acceptance register | `docs/hr/*` |
| HR-01 | Permissions, `hr_*` foundation migration, RPCs, RLS SELECT + RPC writes | `supabase/migrations/20261109190000_hr_management_foundation.sql` |
| HR-02 | Sidebar `/hr`, overview KPIs, employee directory/detail on shared `payroll_employees` | `src/screens/hr/*`, `src/lib/hr/*`, routes |
| HR-03 | Locations, branches, departments, designations CRUD + hierarchy list | `organization.tsx` + `upsert_hr_org_unit` |

## Verification run (this workstation)

| Check | Result |
|-------|--------|
| `npm run check:modules` | Passed |
| `npm run check:navigation` | Passed |
| `npm run check:ui` | Passed |
| `npm run test -- src/lib/hr/sections.test.ts src/lib/modules/registry.test.ts` | 7 passed |
| `npm run build:dev` | Passed (regenerated `routeTree.gen.ts` with `/hr` routes) |
| Supabase migration applied (local/remote) | **Not applied** — SQL committed only |
| Two-tenant RLS SQL smoke executed | **Not executed** |
| Authenticated browser E2E | **Not executed** |
| Staging / production deploy | **Not done** |

## Explicit non-claims

HR Management is **not** production-ready. Leave, attendance, recruitment persistence, ESS, and payroll handoffs remain pending later batches.
