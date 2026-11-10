# HR-05 / HR-06 status

## Delivered (code)

### HR-05 Attendance + Shifts
- Migration: `supabase/migrations/20261109192000_hr_attendance_shifts.sql`
- Tables: `hr_shift_templates`, `hr_shift_assignments`, `hr_attendance_logs`, `hr_attendance_corrections`
- RPCs: list/upsert shifts & assignments; list/upsert attendance logs; list/upsert/decide corrections
- Screens: `/hr/attendance`, `/hr/shifts`
- Dashboard KPI refresh includes attendance exceptions + pending corrections

### HR-06 Leave + Holidays
- Migration: `supabase/migrations/20261109193000_hr_leave_holidays.sql`
- Tables: `hr_leave_types`, `hr_leave_balances`, `hr_leave_requests`, `hr_holiday_calendars`, `hr_holidays`
- Balance enforcement on submit / approve / reject / cancel (DB constraints + RPC math)
- Screens: `/hr/leave`, `/hr/holidays`
- Workflow: leave draft → submitted → approved|rejected|cancelled

## Verification

| Check | Result |
|-------|--------|
| `check:modules` | Passed |
| `check:navigation` | Passed |
| `check:ui` | Passed |
| `src/lib/hr/sections.test.ts` | 2 passed |
| HR TypeScript (`HR_ERR`) | 0 |
| Supabase migration apply | **Not applied** |
| Browser E2E | **Not run** |
| Two-tenant RLS smoke | **Not run** |

## LLM gaps (accepted for now)

See `docs/hr/LLM-VERIFICATION.md`. Notable: no biometric adapters; no visual week roster grid; no ESS self-punch (HR-07); no statutory leave certification claims.

## Honesty

Acceptance criteria AC-05-01 and AC-06-01 are **implemented-untested**. Verified progress remains **25%**.
