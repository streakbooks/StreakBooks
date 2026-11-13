# HR-14 — Staging / migration verification evidence

**Date:** 2026-11-09  
**Target:** Supabase project `linkbook` (`ipxflpzfcqwtenodbxwc`) · production linked  
**Method:** `supabase db query --remote --yes -f <migration>` then `migration repair --status applied --remote --yes`  
**Not used:** `supabase db push` (avoided by project policy)

## Applied HR migrations (remote)

| Version | File | Repair status |
|---------|------|---------------|
| 20261109190000 | hr_management_foundation | applied |
| 20261109191000 | hr_recruitment_onboarding | applied |
| 20261109192000 | hr_attendance_shifts | applied |
| 20261109193000 | hr_leave_holidays | applied |
| 20261109194000 | hr_ess_manager_approvals | applied |
| 20261109195000 | hr_demo_enable | applied |
| 20261109200000 | hr_documents_assets_cases | applied |
| 20261109210000 | hr_talent_performance_training_comp | applied |
| 20261109220000 | hr_transfers_offboarding | applied |
| 20261109230000 | hr_integrations_action_files_payroll | applied |
| 20261109240000 | hr_reports_automations_import | applied |
| 20261109250000 | hr_security_hardening | applied |
| 20261109251000 | hr_report_aggregate_fix | applied |
| 20261109260000 | hr_demo_workforce_seed | applied |

## Security smoke (2026-11-09)

Command: remote SQL asserting all required `hr_*` tables exist, all `hr_%` tables have RLS, and `anon` cannot EXECUTE `*_hr_*` public RPCs.

Result: `status = hr-module-security-ok`

## Gaps remaining for full verified %

- Two-tenant write/isolation smoke (mutate fixtures) not executed on production.
- Authenticated browser E2E of each `/hr/*` surface not recorded.
- Separate staging project evidence (if distinct from linked production) not claimed.

## Rollback note

Additive migrations. Rollback = PITR/backup restore to pre-apply point, then `migration repair --status reverted` only after restore.