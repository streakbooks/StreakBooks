# Expense Management migrations applied — 2026-11-07

## Target

Linked Supabase project `ipxflpzfcqwtenodbxwc` (linkbook) — production environment.

Applied with `npx supabase db query --remote --yes -f <file>` (not `db push`), then
`npx supabase migration repair <version> --status applied --remote --yes`.

## Result

All **27** EM migration files `20261107120000` … `20261107156000` applied successfully.

### Verified objects (read-only query)

| Check | Result |
| --- | --- |
| `public.expense_claims` | present |
| `public.expense_management_settings` | present |
| `public.expense_approval_delegations` | present |
| `list_expense_claims` | present |
| `batch_reimburse_expense_claims` | present |
| `get_expense_budget_exposure` | present |
| `expenses.*` role_permissions rows | 42 |

### Browser smoke (authenticated local app — Demo Company)

| Route | Result |
| --- | --- |
| `/expense-management` | Overview KPIs live |
| `/expense-management/my-expenses` | Form + list; **draft EXP-0001 created** via `save_expense_claim` |
| Submit on EXP-0001 | Succeeded — DB `approval_status=submitted` |
| `/expense-management/approvals` | Shows submitted claim with Approve/Return/Reject |
| Approve as same user | Did **not** change status (still `submitted`) — consistent with **Prevent self-approval** default |
| `/expense-management/reimbursements` | Empty queue + bank match panel OK |
| `/expense-management/reports` | Status/aging/audit empty-state OK |
| `/expense-management/settings` | Defaults form + legacy import OK |

Read-only DB after smoke: 18 `expense%` tables; `list_expense_claims` present; 42 `expenses.*` permissions; EXP-0001 remains `submitted` / `not_eligible`.

## Not claimed

- Full lifecycle past self-approval (approve → post → reimburse needs a second approver or settings change)
- Staging-only apply (this was the linked production project)
- Provider features (OCR email, booking APIs, payroll payslip posting)
- Batch closure to 12/12 verified
