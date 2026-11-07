# EM-12a — Budgets bridge + release hardening notes

## Delivered (local)

- Budgets tab: open claim commitment list + link to Budgets module (no fake budget envelopes)
- Batch reimbursement + advance reclaim UI (EM-07b companion)
- Release checklist below for operators

## Release checklist (not verified until migrations + browser)

1. Apply pending EM migrations through `20261107149000` on a non-production project first.
2. Confirm Action Center `expense_claim` category appears in notification preferences.
3. Smoke: draft → submit → approve → post → reimburse (single + batch).
4. Smoke: issue advance → reclaim remaining; exit settlement finalize.
5. Smoke: Reports CSV export; Settings legacy import preview.
6. Confirm legacy `/purchases/expense-management/*` redirects still work.
7. Run `npm.cmd run test` and `npm.cmd run check:ui` / `check:bundle` before any push.

## Explicitly unverified

Browser E2E, applied migrations, GitHub CI/PR, staging, production.
