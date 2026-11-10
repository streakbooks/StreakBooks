# HR Management — Technical architecture

## 1. Module layout

```
src/lib/hr/                 sections, types, drafts, server functions, policies
src/screens/hr/             route screens (ListWorkspace / RecordWorkspace)
src/components/hr/          HrSubnav and shared HR chrome
src/routes/_authenticated/hr/  index + $section + employee detail
supabase/migrations/*_hr_*.sql
docs/hr/                    PRD, gap matrix, acceptance, progress
```

## 2. Shared employee identity

**Canonical person row:** `public.payroll_employees`

Rationale: already company-scoped, unique employee numbers, contact link, hire/term, salary history, masked banking RPCs. Creating a second person master would violate the integration rule.

**HR extensions:**
- `hr_employee_profiles` — 1:1 with `payroll_employees` (preferred name, manager_employee_id, department_id, designation_id, location_id, emergency contacts, work arrangement)
- `hr_position_history` — effective-dated org/role changes (non-destructive)
- Org tables: `hr_locations`, `hr_branches`, `hr_departments`, `hr_designations`
- `hr_settings` — module enablement and prefixes
- `hr_audit_events` — sensitive change log

Payroll continues to own pay runs, salary version amounts, and payment details. HR may propose compensation changes that Payroll applies only through approved handoff RPCs (HR-11).

## 3. API style

Match CRM/Payroll:
- Client SELECT under RLS where safe
- Mutations via `SECURITY DEFINER` RPCs with `private.hr_require_permission`
- Server functions in `src/lib/hr/*.functions.ts` using `requireSupabaseAuth` + `callRpc`
- Honest migration-missing errors (same pattern as Payroll)

## 4. Authorization model

| Permission | Purpose |
|------------|---------|
| `hr.view` | Read HR surfaces and non-sensitive employee directory |
| `hr.employees.manage` | Create/update profiles and employment facts |
| `hr.employees.sensitive` | View/edit sensitive HR fields |
| `hr.organization.manage` | Org structure CRUD |
| `hr.recruitment.manage` | ATS |
| `hr.onboarding.manage` | Onboarding templates/tasks |
| `hr.attendance.manage` | Attendance admin |
| `hr.leave.manage` | Leave policies/admin |
| `hr.leave.approve` | Approve leave |
| `hr.performance.manage` | Performance |
| `hr.cases.manage` | ER cases |
| `hr.approvals.manage` | Approval config / delegation |
| `hr.reports.view` | Reports |
| `hr.export` / `hr.import` | Bulk |
| `hr.settings.edit` | Module settings |
| `hr.audit.view` | Audit trail |
| `hr.self_service` | ESS for linked user |
| `hr.manager` | Manager workspace |

## 5. Integrations

| System | Contract |
|--------|----------|
| Payroll | Shared employee id; leave/attendance/OT handoff; never mutate finalized runs |
| Accounting | Cost dimensions via existing department/location dimensions where mapped; no double payroll journals |
| Files | Private buckets + signed URLs for HR documents |
| Action Center | Pending approvals, expiries, exceptions cards |
| Notifications | Template + preference + delivery log |

## 6. Migration strategy

1. Additive migrations only; no remote destructive reset.
2. Local `supabase start` / `db reset` before remote dry-run.
3. Staging apply after review; production only with explicit approval.
4. Idempotent `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` patterns.

## 7. Dependency map

```
companies / company_members / role_permissions
        ↓
payroll_employees (canonical)
        ↓
hr_settings, hr_org_*, hr_employee_profiles, hr_position_history
        ↓
hr_recruitment_* / hr_onboarding_* / hr_attendance_* / hr_shifts_* / hr_leave_* / hr_holiday_*
        ↓
payroll runs / Action Center / Files / notifications
```
