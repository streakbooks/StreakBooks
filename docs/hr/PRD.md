# LinkBooks HR Management — Product Requirements Document

| Field | Value |
|-------|-------|
| Module | HR Management |
| Route | `/hr` (authenticated, top-level sidebar) |
| Status | In implementation — not production-ready |
| Canonical employee identity | `public.payroll_employees.id` (shared with Payroll; no duplicate person master) |
| Design policy | Originality-first LinkBooks Design Language; competitor functionality only |
| Target markets | US, UK, AU, NZ, CA, IN (jurisdiction rule packs versioned; no compliance advertising until verified) |

## 1. Problem

LinkBooks has Basic Global Payroll with employee pay records, but no HR lifecycle module. Customers need recruiting, onboarding, organisation structure, attendance, leave, performance, documents, assets, transfers, and offboarding — integrated with Payroll without conflicting masters.

## 2. Goals

1. Deliver a commercially competitive HRMS as a separate navigational module.
2. Share one workforce identity with Payroll (`payroll_employees`).
3. Enforce company isolation, RBAC, sensitive-field controls, and audit trails.
4. Ship working UI + SECURITY DEFINER RPCs + RLS — no cosmetic-only screens for shipped batches.
5. Fail closed until authorised backends exist for later-batch surfaces.

## 3. Non-goals (current release track)

- Jurisdiction-certified statutory leave/tax engines advertised as legally compliant.
- Biometric device drivers (adapters stubbed, disabled until credentials verified).
- Full enterprise LMS / succession planning depth of Workday/SuccessFactors in v1.
- Silent mutation of finalized payroll runs.

## 4. Personas

| Persona | Primary needs |
|---------|---------------|
| HR admin | Org structure, employee master, policies, reports, audit |
| Hiring manager | Requisitions, interviews, team leave/attendance approvals |
| Employee (ESS) | Profile, leave, attendance, documents, requests |
| Payroll clerk | Consume approved leave/attendance/comp changes |
| Owner/admin | Enable module, permissions, integrations |

## 5. Information architecture

See `src/lib/hr/sections.ts`. Subnav groups: Workspace, People, Time, Talent, Lifecycle, Insights, Admin.

## 6. Data ownership

| Domain | Owner module | Store |
|--------|--------------|-------|
| Person identity, hire/term, pay country/currency, salary versions, bank (masked) | Shared / Payroll writes pay fields | `payroll_employees` + payment/salary tables |
| Preferred name, manager, department/designation FKs, emergency contacts, documents meta | HR | `hr_employee_profiles`, org tables |
| Leave balances / requests | HR | `hr_leave_*` (later batch) |
| Attendance / shifts | HR | `hr_attendance_*`, `hr_shifts_*` (later) |
| Pay runs / journals | Payroll / Accounting | existing payroll tables |

## 7. Security principles

- Default-deny RLS; clients SELECT only where permitted; writes via SECURITY DEFINER RPCs.
- Separate `hr.employees.sensitive` for compensation preview, IDs, medical-adjacent flags.
- Never expose service-role keys; never trust client metadata for authz.
- Two-tenant negative tests required before production claim.

## 8. Acceptance

Weighted acceptance criteria live in `ACCEPTANCE_REGISTER.md`. Overall progress percentage is computed only from **verified** criteria.

## 9. Batch plan

HR-00 … HR-15 per the execution directive. Each batch must leave the module honest (fail-closed stubs with batch labels) and preserve Payroll.

## 10. Originality

Visual design uses LinkBooks tokens (`docs/premium-ui/LINKBOOKS_DESIGN_SYSTEM.md`). Competitor products are capability references only — no trade dress, layout clones, or protected assets.

---

### MANDATORY — HR MANAGEMENT INTERACTIVE LLM DESIGN REFERENCE

Implement the complete HR Management module based on the approved interactive Low-Level Model (LLM) preview.

Reproduce its navigation hierarchy, dashboard structure, screen organization, interactive behavior, forms, field groupings, workflow transitions, validations, role-based access, and contextual actions.

Maintain a consistent premium LinkBooks visual design across all screens and submenus. Every action must be fully functional and connected to the real Supabase backend.

Use the LLM as a functional and structural specification, not as production-ready source code. Do not introduce placeholder buttons or simulated records into production.

Apply the LinkBooks Originality-First Design Policy throughout.

Verify the implemented screens against the approved LLM and document any differences or missing functionality before marking a batch complete.

**Authoritative structural LLM for this programme:** `docs/hr/LLM-DESIGN-REFERENCE.md` (derived from the approved HR execution directive navigation and workflow IA). Interactive preview artefacts outside the repository must be attached or linked before UI pixel-parity claims. Verification log: `docs/hr/LLM-VERIFICATION.md`.
