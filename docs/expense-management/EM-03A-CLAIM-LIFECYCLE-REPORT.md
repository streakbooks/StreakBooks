# EM-03a — Claim draft lifecycle report

**Result:** Partially completed — save/list/submit/withdraw/delete draft lifecycle implemented in SQL + UI; splitting, templates, allocations and full multi-line editor remain for later EM-03 work.

## Completed

- Migration `20261107123000_expense_management_claim_lifecycle.sql` with SECURITY DEFINER RPCs.
- TypeScript server functions and claim mappers.
- **My Expenses** create draft / submit / withdraw / delete.
- **All Claims** organisation list for view/approve/audit roles.
- Unit tests for claim mapping.

## Remaining in EM-03

- Multi-line editor, expense splitting and allocations.
- Templates, duplicate claim, print/export claim.
- Return-for-correction / resubmit UX beyond returned status support in save RPC.
- Kanban claim board.
