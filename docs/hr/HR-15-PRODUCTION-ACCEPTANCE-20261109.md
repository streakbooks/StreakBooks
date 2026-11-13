# HR-15 — Production acceptance evidence

**Date:** 2026-11-09  
**Branch:** `feature/hr-management-batch00-foundation` (local WIP, not committed)  
**App URL checked:** `http://localhost:8080` against linked production Supabase `ipxflpzfcqwtenodbxwc`  
**Demo org:** Demo Company Ltd.

## Verified in this pass

| Check | Result |
|-------|--------|
| `/hr` overview loads with KPIs including Payroll handoffs | Pass |
| Subnav includes Reports + Automations (HR-12) | Pass |
| `/hr/reports` runs headcount report after aggregate fix `20261109251000` | Pass (empty demo data → honest “No rows”) |
| Import dry-run UI present | Pass |
| Remote security smoke `hr-module-security-ok` | Pass (HR-13) |
| Migrations `190000`–`251000` applied + repaired | Pass (HR-14 doc) |

## Not claimed as full production sign-off

- Two-tenant write/isolation smoke
- Full CRUD walkthrough of every HR surface with non-empty fixtures
- Commit / PR / merge / Vercel deploy of this branch
- Verified % remains formula-bound: earlier criteria still largely `implemented-untested`

## Fix shipped during acceptance

`20261109251000_hr_report_aggregate_fix.sql` — nested aggregate error in `run_hr_report` for headcount/leave reports.