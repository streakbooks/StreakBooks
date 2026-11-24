# Expense Management — Repository Audit and Gap Analysis

**Batch:** EM-01 foundation (audit portion)  
**Verified against local tree:** `D:\MyApp\StreakBooks` on branch `main` at `fb33b80`  
**Authoritative remote:** https://github.com/streakbooks/StreakBooks  
**Date:** 2026-11-07

This document is an evidence-based inventory. Presence of screens or tables is not production readiness.

## 1. Baseline inventory

### Already live (Purchases MVP)

| Capability | Evidence | Notes |
| --- | --- | --- |
| Direct spend-money expenses | `purchase_expenses`, `/purchases/expenses`, `saveAndPostExpense`, `postDirectExpense` | Header-only; posts DR expense (+tax) / CR bank immediately |
| Employee claim submit / approve+pay / reject | `employee_expense_claims`, `/purchases/employee-expenses` | Single amount; approve posts bank credit in one step |
| Permissions | `expenses.submit`, `expenses.approve` | Coarse RLS; claimant privacy is app-filtered |
| COA flag | `accounts.show_in_expense_claims` | Not wired into claim account picker |
| Feature flag | `expense_claims` in feature registry | Registered live; route gating unverified |
| Attachments | `purchase_expense` entity only | Claims not in attachment entity catalogue |

### Explicitly missing (approved EM scope)

Mileage, travel/per diem, cash advances, petty cash floats, corporate card register/matching, spending requests, multi-line claims, separate approval/posting/reimbursement state machines, employee payable accrual, receipt email inbox, OCR/AI extraction, policy engine, budget commitments for expenses, customer rebilling from claims, advanced reports/dashboard workspace, employee portal My Expenses, offline drafts, import/migration tooling.

## 2. Reuse map (do not duplicate)

| Domain | Reuse |
| --- | --- |
| Journals | `postJournal` / `post_journal`; existing `source_type: "expense"` |
| Banking / pay-from | `listPaymentAccounts`, bank matching, card feeds |
| Tax | Existing tax engine and tax codes — no hard-coded country formulas |
| Dimensions | `tracking_categories` / `tracking_options` (class, department, location, cost_centre) + `projects` |
| Files | `document_attachments` + secure signed URLs |
| Budgets | Budget approval/commitment patterns from Budgets module |
| Sales rebilling | Existing invoice draft/line services |
| Payroll | Payroll payment/settlement paths for reimbursements via payroll |
| Auth / RLS | `requireSupabaseAuth`, `has_company_permission`, company membership |
| UI | Purchases subnav, ListKit, DocumentRecordPanel, Create New registry |

## 3. Architecture decisions (EM-01)

1. **Keep MVP tables.** `purchase_expenses` remains company spend-money. `employee_expense_claims` remains the current live claim path until EM-03 migrates callers to the new multi-line model.
2. **New foundation tables** use `expense_*` names (`expense_claims`, `expense_claim_lines`, …) with separate `approval_status`, `posting_status`, and `reimbursement_status`.
3. **Writes are SECURITY DEFINER RPCs** (payroll pattern). Clients get SELECT under RLS; mutations check permissions server-side.
4. **Permission expansion** adds post/reimburse/policy/card/advance/export/audit/admin keys while preserving `expenses.submit` and `expenses.approve`.
5. **Accounting integrity first.** No new journal source until EM-06; posting stays conceptual in schema (`posted_journal_id`) without inventing parallel ledgers.
6. **Standalone navigation (approved).** Expense Management is a top-level sidebar module at `/expense-management`, not nested under Purchases. Purchases retains bills and company spend-money.

## 4. Requirement → batch map

| Requirement area | Batch |
| --- | --- |
| Audit, schema foundation, permissions | EM-01 |
| Navigation workspace, dashboard, lists/Kanban | EM-02 |
| Claims, lines, split/allocations, templates, lifecycle | EM-03 |
| Receipts, inbox, file security, offline drafts | EM-04 |
| Approvals, policies, delegation, spending requests | EM-05 |
| Accounting, tax, FX, refunds, budgets | EM-06 |
| Reimbursements, bank match, payroll payout | EM-07 |
| Mileage, travel, per diem, advances, petty cash | EM-08 |
| Corporate cards, rebilling, exit settlement | EM-09 |
| AI OCR, duplicates, automation | EM-10 |
| Reports, notifications, imports/exports, audit UX | EM-11 |
| Integration hardening, security, performance, release | EM-12 |

## 5. Verified blockers / non-claims

- Hosted GitHub Actions must not be triggered by this workstream (project policy).
- OCR, inbound email, map mileage providers and payout providers are **pending** until configured services are verified.
- Database migrations in this batch are **committed SQL only** until applied through an approved process.
- Existing MVP approve-and-pay path is not yet replaced; both models coexist until cutover.
