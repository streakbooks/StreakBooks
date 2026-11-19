# HR Management — Interactive LLM design reference (structural)

**Status:** Approved structural Low-Level Model (LLM) for LinkBooks HR.  
**Source:** Final production-grade HR execution directive (navigation, lifecycle, RBAC, workflows).  
**Note:** No separate interactive preview package was found in the repository at implementation time. This document is the in-repo functional/structural specification. External Lovable/Figma previews, if later attached, supersede visual composition details only when originality review passes.

## 1. Navigation hierarchy (must match product)

| Group | Menu | Primary behaviours |
|-------|------|--------------------|
| Overview | HR Overview | KPIs, pending approvals, alerts, deadlines |
| Overview | Employee Self-Service | Profile, requests, leave, attendance, documents |
| Overview | Manager Workspace | Team, approvals, schedules, exceptions, delegation |
| People | Employees | Directory, search/filters, profiles, history |
| People | Organization | Companies/branches, departments, designations, reporting, org chart |
| People | Employee Documents | Contracts, IDs, expiry, signatures |
| People | Employee Assets | Allocation, return, condition, custody |
| Recruitment | Recruitment | Requisitions, openings, applications, interviews, offers |
| Recruitment | Onboarding | Pre-joining, documents checklist, orientation, approvals |
| Recruitment | Employee Relations | Grievances, HR cases, disciplinary workflows |
| Recruitment | Transfers & Promotions | Role/dept/manager/location changes |
| Recruitment | Offboarding | Resignations, clearances, asset returns, exit |
| Time & Leave | Attendance | Check-in/out, logs, corrections, regularization, timesheets |
| Time & Leave | Shifts & Rosters | Schedules, rotations, breaks, weekly offs, overtime |
| Time & Leave | Leave Management | Policies, balances, requests, approvals, accruals |
| Time & Leave | Holidays & Calendar | Holiday calendars, locations, team availability |
| Performance | Performance | Goals, KPIs, evaluations, feedback, appraisals |
| Performance | Training & Development | Courses, certifications, learning plans, skills |
| Compensation | Compensation & Benefits | Comp history, benefits enrollment, approved changes |
| Reports | HR Reports | Workforce, attendance, leave, turnover, performance |
| Administration | HR Approvals | Multilevel approvals, delegation |
| Administration | HR Automations | Reminders, escalations, scheduled workflows |
| Administration | HR Settings | Policies, roles, schedules, custom fields |
| Administration | HR Audit Trail | Sensitive changes, actor, timestamp, approvals |

Presentation uses compact two-row `GroupedModuleSubnav` (group selectors + section links). Routes and section keys are unchanged.

## 2. Dashboard structure (HR Overview)

- KPI strip: active headcount, profiles linked, departments, locations, pending approvals, attendance exceptions, expiring documents, terminated
- Compliance/disclaimer alert (honest — no jurisdiction certification claim)
- Enablement gate when HR settings disabled
- Deep links from KPIs into owning sections

## 3. Screen organization patterns

- Authenticated `AppShell` + `HrSubnav` grouped navigation
- Lists: `ListWorkspace` + filters + `TableCard` + clickable rows
- Records: `RecordWorkspace` + field groups + history rail
- Create/edit: dialogs or inline forms with validation; fail closed without permission
- Status: draft / submitted / approved / rejected / cancelled / archived with label + tone (not colour alone)

## 4. Workflow transitions (LLM)

| Flow | States |
|------|--------|
| Requisition | draft → open → filled / cancelled |
| Application | applied → screening → interview → offer / rejected / withdrawn |
| Offer | draft → extended → accepted / declined / expired |
| Onboarding case | planned → in_progress → completed / cancelled |
| Onboarding task | pending → done / blocked / skipped |
| Leave | draft → submitted → approved / rejected → cancelled |
| Attendance log | open → complete / exception / cancelled |
| Attendance correction | submitted → approved / rejected / cancelled |

## 5. Role-based access (LLM)

Permissions `hr.*` as seeded in foundation migration. Self-service and manager scopes are stricter than HR admin. Sensitive compensation/ID fields require `hr.employees.sensitive`.

## 6. Integrations (LLM)

- Canonical employee = `payroll_employees`
- Payroll handoff for leave/OT/comp — never mutate finalized payroll silently
- Files for confidential documents; Action Center for pending work

## 7. Originality

LinkBooks tokens, navy/blue shell language, Lucide icons. Do not reproduce competitor trade dress.
