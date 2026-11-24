# HR LLM verification log

Compare implemented product against `LLM-DESIGN-REFERENCE.md`.  
**Rule:** Batch cannot be marked complete until differences below are either resolved or explicitly accepted with evidence.

| LLM surface | Implemented | Backend | Diff / gap | Batch |
|-------------|-------------|---------|------------|-------|
| Navigation hierarchy (24 sections) | Yes — `HR_SECTIONS` | Route registry | Labels match LLM; groups are StreakBooks IA (Workspace/People/Time/Talent/Lifecycle/Insights/Admin) | HR-02 |
| HR Overview KPIs | Yes | `get_hr_dashboard_kpis` | Pending approvals now include attendance corrections + leave requests (after HR-05/06 migrations); expiring documents still 0 until HR-08 | HR-02 |
| Employees directory + profile | Yes | list/get/upsert profile RPCs | Create employee still via Payroll (by design — shared identity) | HR-02 |
| Organization CRUD + hierarchy | Yes | org unit RPCs | Interactive graphical org chart not yet; hierarchy list present | HR-03 |
| Recruitment ATS | Yes — requisitions, applications, interview schedule, offers | `20261109191000` RPCs | Candidate→employee conversion handoff still Payroll-create (shared identity); interview list UI is action-driven not full calendar board | HR-04 |
| Onboarding checklists | Yes — templates, cases, task status transitions | `20261109191000` RPCs | Pre-joining document upload uses later Files batch; orientation content is checklist-based | HR-04 |
| Attendance | Yes — logs, corrections, approve/reject | `20261109192000` RPCs | Device/biometric adapters not shipped (non-goal); ESS self punch lands in HR-07; timesheet export later | HR-05 |
| Shifts & Rosters | Yes — templates + assignments | `20261109192000` RPCs | Weekly rotation UI is mask-backed (Sat/Sun default 65) not a visual week grid; overtime rules deferred | HR-05 |
| Leave Management | Yes — types, balances, requests, decide | `20261109193000` RPCs | Balance enforced on submit/approve/reject/cancel; statutory jurisdiction packs not claimed | HR-06 |
| Holidays & Calendar | Yes — calendars + holidays | `20261109193000` RPCs | Team availability heat-map not yet; location-linked calendars supported via optional location_id | HR-06 |
| ESS / manager / approvals | Yes — self-service, manager team, approvals inbox | `20261109194000` RPCs | Delegation UI not yet; user-link is admin RPC (`link_hr_employee_user`); Action Center cards deferred to HR-11 | HR-07 |
| Documents / assets / cases | Yes | `20261109200000` RPCs | Storage upload path still Files batch; case workflow is list+upsert | HR-08 |
| Performance / training / compensation | Yes | `20261109210000` RPCs | Full appraisal workflow UI is cycle/goal focused; compensation is proposal/handoff only (no payroll mutate) | HR-09 |
| Transfers / offboarding | Yes | `20261109220000` RPCs | Approve applies profile+position history; offboarding clears to ready_for_payroll without terminating payroll_employees | HR-10 |
| Reports / automations | Yes | `20261109240000` RPCs | Import is dry-run only (Payroll owns employee master); cron best-effort via pg_cron | HR-12 |
| Settings / audit | Yes | settings + audit RPCs | — | HR-01 |
| Interactive external preview package | **Not in repo** | N/A | Structural LLM used; attach external preview before pixel-parity claims | — |

## Accepted differences (originality / architecture)

1. Shared employee master lives in Payroll tables — LLM “Employees” UI is HR-owned presentation.
2. Visual composition follows StreakBooks premium shell, not a competitor mock.
3. Fail-closed later-batch screens remain registered (deep links) without fake data.
4. Attendance correction submit allows `hr.attendance.manage` or `hr.manager`; employee self-service punch/request scope is HR-07.
5. Leave upsert allows draft/submitted/cancelled; approve/reject goes through `decide_hr_leave_request` with balance mutation.

## Batch complete gate (HR-05 / HR-06)

- Code + SQL authored and wired into `/hr/attendance`, `/hr/shifts`, `/hr/leave`, `/hr/holidays`.
- **Not batch-complete for production:** migrations not applied; RLS/E2E evidence pending → acceptance status remains `implemented-untested`.
