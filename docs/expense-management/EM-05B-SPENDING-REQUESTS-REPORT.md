# EM-05b — Spending requests and pre-spend policy

**Result:** Partially completed — coded locally. Migrations not applied; delegation/escalation and claim-detail link UI remain lighter than full EM-05.

## Completed

- `expense_spending_requests` table with draft/submit/cancel/decide RPCs.
- Settings policy `require_spending_request_above_minor` (0 = off).
- Claim submit enforces the threshold when an approved linked request is required.
- `link_expense_claim_spending_request` RPC for attaching an approved request to a draft claim.
- Spending Requests workspace UI for create/submit/cancel/approve/return/reject.
- Settings field for the threshold.
- Unit tests for mapping and threshold policy helper.

## Not claimed

- Multi-level approval chains, delegation, escalation timers.
- Rich claim-detail picker UI for linking requests (RPC exists).
- Applied migrations / browser E2E / GitHub push.
