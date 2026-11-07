# EM-06a — Post approved claims to the ledger

**Result:** Partially completed — coded locally. Migrations not applied; corporate-card / company-paid posting and bank reimbursement remain later.

## Completed

- `post_expense_claim` RPC: employee-paid approved claims → DR expense lines + input tax, CR employee payable.
- `post_journal` permission bridge for `expenses.post` when `source_type = expense` and source is an `expense_claim`.
- Settings: employee payable account picker (required before posting).
- Claim detail **Post to ledger** action.
- Approvals page **Ready to post** queue.
- Pure unit tests for accrual line builder.

## Not claimed

- Bank reimbursement / payment journals (EM-07).
- Corporate card / cash advance / company-paid posting paths.
- Reverse-charge tax edge cases.
- Applied migrations / browser E2E / GitHub push.
