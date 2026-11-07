# EM-05a — Claim approvals

**Result:** Partially completed — approve / return / reject / start-review coded locally. Migrations not applied; multi-level policies, delegation, escalation and spending requests remain for later EM-05 slices.

## Completed

- RPCs: `start_expense_claim_review`, `approve_expense_claim`, `return_expense_claim`, `reject_expense_claim`.
- Self-approval blocked when `prevent_self_approval` is true (default).
- Approve sets `posting_status = ready` and reimbursement `eligible` for employee-paid claims (no journal posting).
- Approvals tab lists submitted / in-review claims with decision actions and required reasons for return/reject.
- Unit tests for approval action helpers.

## Not claimed

- Multi-level approval policies, delegation, escalation.
- Spending requests workflows.
- Journal posting (EM-06) or reimbursement payout (EM-07).
- Applied migrations / browser E2E / GitHub push.
