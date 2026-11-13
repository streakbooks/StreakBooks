# HR Management — Interactive LLM design reference (structural)

**Status:** Approved structural Low-Level Model (LLM) for LinkBooks HR.  
**Source:** Final production-grade HR execution directive (navigation, lifecycle, RBAC, workflows).  
**Note:** No separate interactive preview package was found in the repository at implementation time. This document is the in-repo functional/structural specification. External Lovable/Figma previews, if later attached, supersede visual composition details only when originality review passes.

## 1. Navigation hierarchy (must match product)

| Group | Menu | Primary behaviours |
|-------|------|--------------------|
| Workspace | HR Overview | KPIs, pending approvals, alerts, deadlines |
| People | Employees | Directory, search/filters, profiles, history |
| People | Organization | Companies/branches, departments, designations, reporting, org chart |
| Lifecycle | Recruitment | Requisitions, openings, applications, interviews, offers |
| Lifecycle | Onboarding | Pre-joining, documents checklist, orientation, approvals |
| Time | Attendance | Check-in/out, logs, corrections, regularization, timesheets |
| Time | Shifts & Rosters | Schedules, rotations, breaks, weekly offs, overtime |
| Time | Leave Management | Policies, balances, requests, approvals, accruals |
| Time | Holidays & Calendar | Holiday calendars, locations, team availability |
| People | Employee Documents | Contracts, IDs, expiry, signatures |
| Workspace | Employee Self-Service | Profile, requests, leave, attendance, documents |
| Workspace | Manager Workspace | Team, approvals, schedules, exceptions, delegation |
| Talent | Performance | Goals, KPIs, evaluations, feedback, appraisals |
| Talent | Training & Development | Courses, certifications, learning plans, skills |
| Talent | Compensation & Benefits | Comp history, benefits enrollment, approved changes |
| People | Employee Assets | Allocation, return, condition, custody |
| Lifecycle | Employee Relations | Grievances, HR cases, disciplinary workflows |
| Lifecycle | Transfers & Promotions | Role/dept/manager/location changes |
| Lifecycle | Offboarding | Resignations, clearances, asset returns, exit |
| Insights | HR Reports | Workforce, attendance, leave, turnover, performance |
| Admin | HR Approvals | Multilevel approvals, delegation |
| Admin | HR Automations | Reminders, escalations, scheduled workflows |
| Admin | HR Settings | Policies, roles, schedules, custom fields |
| Admin | HR Audit Trail | Sensitive changes, actor, timestamp, approvals |

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
