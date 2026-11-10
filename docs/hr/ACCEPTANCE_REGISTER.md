# HR Management — Acceptance criteria register

**Rule:** A criterion counts as **verified** only when code, DB/RPC (if applicable), security, UI, and workflow tests for that criterion have passed with recorded evidence.  
**Weights:** P0=5, P1=3, P2=2, P3=1  
**Overall %** = (sum of weights of verified) / (sum of weights of approved) × 100

| ID | Batch | Criterion | Weight | Status | Evidence |
|----|-------|-----------|--------|--------|----------|
| AC-00-01 | HR-00 | Repository audit documented (Payroll reuse, no duplicate HR module) | 5 | verified | This docs set + payroll_employees identified |
| AC-00-02 | HR-00 | PRD published | 5 | verified | `docs/hr/PRD.md` |
| AC-00-03 | HR-00 | ≥10 competitors researched in gap matrix | 5 | verified | `docs/hr/COMPETITOR_GAP_MATRIX.md` (12 platforms) |
| AC-00-04 | HR-00 | Architecture + shared identity decision recorded | 5 | verified | `docs/hr/ARCHITECTURE.md` |
| AC-00-05 | HR-00 | Weighted acceptance register with progress formula | 3 | verified | This file |
| AC-01-01 | HR-01 | HR permissions seeded in migration + TS matrix | 5 | implemented-untested | Migration + `permissions.ts` present; DB apply pending |
| AC-01-02 | HR-01 | `hr_settings` + org foundation tables + RLS | 5 | implemented-untested | SQL committed; not applied remotely |
| AC-01-03 | HR-01 | `private.hr_require_permission` + seed defaults RPC | 5 | implemented-untested | In foundation migration |
| AC-01-04 | HR-01 | Profiles FK to `payroll_employees` (no second person master) | 5 | implemented-untested | `hr_employee_profiles.employee_id` FK |
| AC-01-05 | HR-01 | SQL smoke / unit coverage for permission helpers | 3 | pending | Smoke SQL authored, not executed |
| AC-02-01 | HR-02 | Sidebar module + registry + nav registered | 5 | verified | `check:modules` + `check:navigation` + registry tests |
| AC-02-02 | HR-02 | All HR sections deep-linkable (wired or honest fail-closed) | 5 | verified | sections test + `$section` route + build |
| AC-02-03 | HR-02 | Overview KPIs from authorised RPC | 5 | implemented-untested | UI+RPC coded; migration not applied |
| AC-02-04 | HR-02 | Employee directory lists shared payroll employees | 5 | implemented-untested | UI+RPC coded; migration not applied |
| AC-02-05 | HR-02 | Employee detail RecordWorkspace with profile fields | 5 | implemented-untested | UI+RPC coded; migration not applied |
| AC-03-01 | HR-03 | Locations / departments / designations CRUD | 5 | implemented-untested | UI+RPC coded; migration not applied |
| AC-03-02 | HR-03 | Org chart from manager + department data | 3 | implemented-untested | Department hierarchy list (not interactive org chart) |
| AC-04-01 | HR-04 | Recruitment + onboarding persistence | 5 | implemented-untested | Migration + screens coded; DB apply pending |
| AC-05-01 | HR-05 | Attendance + shifts with timezone-safe RPCs | 5 | implemented-untested | Migration `20261109192000` + attendance/shifts screens; DB apply pending |
| AC-06-01 | HR-06 | Leave balances DB-enforced | 5 | implemented-untested | Migration `20261109193000` + leave/holidays screens; balance checks in upsert/decide; DB apply pending |
| AC-07-01 | HR-07 | ESS + manager + approvals | 5 | implemented-untested | Migration `20261109194000` + ESS/manager/approvals screens; DB apply pending |
| AC-08-01 | HR-08 | Documents / assets / cases | 3 | implemented-untested | Migration 20261109200000 applied remote + screens |
| AC-09-01 | HR-09 | Performance / training / compensation refs | 3 | implemented-untested | Migration 20261109210000 applied remote + screens |
| AC-10-01 | HR-10 | Transfers / promotions / offboarding | 5 | implemented-untested | Migration 20261109220000 applied remote + screens |
| AC-11-01 | HR-11 | Payroll/Accounting/Files/Action Center integrations | 5 | implemented-untested | Migration 20261109230000 applied remote + Action Center/Files/Payroll handoff |
| AC-12-01 | HR-12 | Reports / automations / import-export | 3 | implemented-untested | Migration 20261109240000 applied remote + reports/automations screens |
| AC-13-01 | HR-13 | Security hardening + regression | 5 | implemented-untested | Migration 20261109250000 + remote smoke `hr-module-security-ok`; two-tenant write smoke still pending |
| AC-14-01 | HR-14 | Staging migration verification evidence | 5 | implemented-untested | docs/hr/HR-14-MIGRATION-VERIFICATION-20261109.md (linked prod apply evidence) |
| AC-15-01 | HR-15 | Production acceptance with evidence | 5 | implemented-untested | docs/hr/HR-15-PRODUCTION-ACCEPTANCE-20261109.md — browser smoke + security/migration evidence; full E2E pending |

## Totals (recompute when statuses change)

| Metric | Value |
|--------|-------|
| Approved criteria | 29 |
| Sum of weights (approved) | 131 |
| Verified criteria | 7 |
| Sum of weights (verified) | 33 |
| Implemented not fully tested | 18 |
| Sum of weights (implemented-untested) | 79 |
| Pending | 4 |
| Blocked | 0 |
| **Overall verified progress** | **25%** (33/131) — verified % unchanged until DB/E2E evidence |
