# HR Management — Competitor gap matrix

**Method:** Public product documentation and industry capability reports (2024–2026). Functionality only — no visual copying.  
**Labels for LinkBooks:** `missing` | `payroll-only` | `partial` | `implemented` | `verified`  
**Priority:** P0 critical path · P1 strong SMB/mid-market · P2 enterprise differentiator · P3 defer  
**Complexity:** S / M / L / XL

Sources consulted include Odoo HR whitepaper, Ascend HCM vendor comparison, Nucleus Research Enterprise HCM matrix, vendor marketing for Workday, SAP SuccessFactors, Oracle Fusion HCM, UKG Pro, ADP Workforce Now, Rippling, BambooHR, HiBob, Zoho People, Darwinbox, Personio.

| Capability | Competitors (verified pattern) | LinkBooks today | Gap | UX opportunity | Security / compliance | Priority | Complexity | Proposed improvement | Batch | Acceptance evidence |
|------------|--------------------------------|-----------------|-----|----------------|----------------------|----------|------------|----------------------|-------|---------------------|
| Employee master / HRIS | All 12 | payroll-only (`payroll_employees`) | No HR profile, manager, org FKs, history UI in HR module | Premium directory + RecordWorkspace | Field-level sensitive + audit | P0 | M | Extend profiles on shared ID; HR directory | HR-01/02 | CRUD + RLS tests |
| Org chart / departments | Odoo, Workday, BambooHR, HiBob, Darwinbox | missing (free-text dept on payroll) | Structured org + chart | Interactive org tree | Company-scoped | P0 | M | `hr_departments`, locations, designations | HR-03 | Org CRUD + chart |
| Recruitment / ATS | BambooHR, Rippling, SuccessFactors, Personio, Zoho | missing | Full ATS | Requisition → offer pipeline | Candidate PII | P1 | L | Jobs, applications, interviews | HR-04 | E2E hire convert |
| Onboarding checklists | BambooHR, Rippling, HiBob, ADP | missing | Templates + tasks | Progress workspace | Document ACLs | P1 | M | Templates + ESS tasks | HR-04 | Checklist complete |
| Attendance / time | UKG, ADP, Darwinbox, Zoho, Odoo | missing (payroll hours adjust only) | Punches, exceptions | Calendar + regularization | Timezone integrity | P0 | L | Attendance logs + approvals | HR-05 | Concurrency tests |
| Shifts / rosters | UKG, Darwinbox, Rippling | missing | Schedules / OT | Roster grid | Location schedules | P1 | L | Shift definitions + assignments | HR-05 | Overnight shift cases |
| Leave policies / balances | All mid-market+ | missing | Accruals DB-enforced | Policy builder + request UX | Balance concurrency | P0 | L | Policy + balance ledger | HR-06 | Overlap / LWP tests |
| Holidays / calendars | Odoo, Zoho, Personio | missing | Multi-location calendars | Team availability | Date-only vs timestamptz | P1 | S | Holiday calendars | HR-06 | Multi-location |
| Employee self-service | All | missing | ESS portal | Mobile-friendly requests | Self boundary | P0 | M | ESS workspace | HR-07 | Self-only RLS |
| Manager workspace | Workday, HiBob, UKG | missing | Team approvals | Delegation UX | Delegation audit | P0 | M | Manager queue | HR-07 | Delegation tests |
| Documents / e-sign | Rippling, BambooHR, Personio | partial (Files module) | HR doc types + expiry | Expiry alerts | Signed URLs | P1 | M | HR docs on Files | HR-08 | ACL + expiry |
| Assets custody | Rippling, Darwinbox | partial (fixed assets accounting) | People custody | Allocate/return | Custody audit | P1 | M | `hr_assets` | HR-08 | Return workflow |
| Performance / goals | SuccessFactors, Workday, HiBob, Zoho | missing | Cycles + feedback | Review workspace | Confidential reviews | P2 | L | Goals + appraisals | HR-09 | Cycle close |
| Learning / skills | SuccessFactors, Darwinbox, UKG | missing | Courses / certs | Skills matrix | Cert expiry | P2 | M | Training records | HR-09 | Expiry alerts |
| Compensation history (HR view) | Workday, Rippling, Personio | payroll-only salary versions | HR-facing history + approvals | Comp change request | Sensitive permission | P1 | M | Bridge salary versions | HR-09/11 | No silent payroll edit |
| Benefits enrollment | ADP, Workday, Rippling, BambooHR | missing | Enrollment | Benefits wizard | Dependent PII | P2 | L | Benefits plans | HR-09 | Enrollment states |
| ER / cases / discipline | SuccessFactors, UKG, Darwinbox | missing | Case workflows | Case RecordWorkspace | Strict ACL | P2 | M | HR cases | HR-08 | Restricted viewers |
| Transfers / promotions | Workday, Odoo, Darwinbox | missing | Effective-dated moves | Change wizard | Maker-checker | P1 | M | Position history | HR-10 | Effective dating |
| Offboarding / clearance | Rippling, BambooHR, ADP | partial (payroll terminate) | Exit checklist + payroll handoff | Clearance board | Access removal audit | P0 | M | Offboarding + settlement hook | HR-10/11 | Final settlement gate |
| Multilevel approvals | Expense module exists; HR missing | partial (expenses pattern) | HR approval engine | Shared patterns | Escalation / delegate | P0 | M | Reuse expense patterns | HR-07 | Multi-level tests |
| Automations / reminders | Rippling, Zoho, Darwinbox | missing | Jobs + templates | Action Center cards | Idempotent jobs | P1 | M | Schedulers + notifications | HR-12 | Retry logs |
| Workforce analytics | Workday, SuccessFactors, UKG | missing | Headcount / turnover | Report workspace | Export ACL | P1 | M | HR reports | HR-12 | Export permission |
| CSV import/export | BambooHR, Personio, Payroll employees | payroll-only | HR-aware import | Preview + merge | Duplicate detection | P1 | M | Extend import | HR-12 | Dry-run evidence |
| Multi-entity / multi-location | Workday, Oracle, UKG, Darwinbox | company-scoped only | Branches / locations | Location filters | Tenant isolation | P1 | M | Locations + branches | HR-03 | Cross-company deny |
| Global compliance packs | Workday, Oracle, ADP, UKG | missing | Rule packs | Honest disclaimers | Legal review gate | P2 | XL | Versioned packs | HR-13+ | No compliance claim |
| IT provisioning (Rippling-like) | Rippling | missing | External adapters | Disabled until connected | Revocable scopes | P3 | L | Stub adapters | Future | Disabled state |
| Biometrics / clocks | UKG, ADP | missing | Adapter interface | Consent UX | Local law limits | P3 | XL | Interface only | Future | Consent flags |

## Prioritization for LinkBooks customers

Focus P0/P1 for SMB → mid-market with multi-location. Defer full enterprise succession, agentic AI HR ops, and deep benefits administration until core time/leave/lifecycle is verified.

## Originality note

LinkBooks HR IA uses Workspace / People / Time / Talent / Lifecycle grouping and LinkBooks shell tokens. Do not mimic Odoo enterprise purple chrome, Workday card density, or BambooHR green marketing layouts.
