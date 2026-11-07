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

### Browser smoke (authenticated local app)

- `http://localhost:8080/expense-management` loaded Expense Management overview
- Live KPI cards included **EM claims / Pending EM approvals / Approved EM claims / Awaiting reimbursement** (zeros with Demo Company) — confirms `expense_claims` is readable from the app

## Not claimed

- Full authenticated workflow E2E (submit → approve → post → reimburse)
- Staging-only apply (this was the linked production project)
- Provider features (OCR email, booking APIs, payroll payslip posting)
