# HR permission & access fix — 2026-11-09

## Diagnosis

Demo Company showed **No HR access / ask for hr.view** because:

1. UI gates use company.permissions from platform_company_context.
2. That RPC builds the list from public.role_permissions via has_company_permission.
3. HR foundation migration 20261109190000 (which seeds hr.view for owner/admin/…) was **authored locally but not applied** to production project ipxflpzfcqwtenodbxwc.
4. Frontend permissions.ts already contained the HR catalogue — the gap was remote DB seed, not the TypeScript matrix.

## Repair applied (production)

Method: 
px supabase db query --remote --yes -f <file> then migration repair --status applied --remote --yes (not blind db push).

| Version | Result |
|---------|--------|
| 20261109190000 foundation (incl. role_permissions) | Applied |
| 20261109191000 recruitment/onboarding | Applied |
| 20261109192000 attendance/shifts | Applied |
| 20261109193000 leave/holidays | Applied |
| 20261109194000 ESS/manager/approvals | Applied |
| 20261109195000 demo enable + reaffirm hr.view | Applied |

Verification:

- owner/admin each have 19 hr.* role_permissions rows; hr.view present for owner
- hr_settings, hr_leave_requests, hr_attendance_logs exist
- Demo companies have hr_settings.enabled = true

## Client hardening

- useCan unions the TypeScript role catalogue for **owner** and **admin** with server permissions so newly shipped module keys are not UI-blocked by a stale session list. RLS/RPC remain authoritative.
- Access-denied copy on HR overview names the missing permission and active role.

## Future-module automation

- scripts/check-module-permissions.mjs fails 
pm run check:modules when a mapped sidebar module lacks catalogue keys, owner coverage, or migration seeds.
- Wired first in package.json check:modules.

## User action required

Hard-refresh the browser (or sign out/in) on Demo Company so platform_company_context reloads. After refresh, owners/admins should open /hr without the No HR access gate.