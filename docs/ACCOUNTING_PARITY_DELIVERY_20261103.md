# Accounting parity delivery — 3 November 2026

## Task 1: purchase-order workflow

Implemented:

- Up to 200 lines with independent descriptions, accounts, quantities, unit prices, discounts and percentage tax. Add, duplicate, reorder and remove lines; supplier instructions/memo; exact subtotal/tax/total preview.
- Server validation for tenant IDs, active supplier, active/postable accounts, real calendar dates, quantity precision, non-negative safe-integer money, discount limits, tax precision, line count and total limits.
- Dedicated `/purchases/orders/:orderId` detail route; supplier/date/status, sorted line details, discounts, totals, memo and linked draft bill.
- Reused StreakBooks print/PDF, existing provider-dependent email controls, notes, files and activity panel. Purchase-order links from documents/files now open the actual record.
- Manual Mark as sent and confirmed cancellation, authenticated permission checks, tenant filters and previous-state conditions. Mark as sent explicitly does not claim an email was sent; partially received/billed/cancelled orders cannot be cancelled through this action.
- Order-number search/display, status filter, true document currencies and currency column in CSV. Search and export apply to the loaded latest 100 orders, explicitly labelled. Full server pagination/search remains pending.
- Conversion checks the previous order state before linking its provisional draft bill. A concurrent cancellation/state change is not overwritten; the losing conversion cleans up its draft bill.
- Fractional quantity regression fixed: recover the implied discount using the bill editor's six-decimal quantity calculation, rather than rounding a second time. Printable order discounts use the same helper. No shared tax-rounding policy was changed.
- Creation/status activity is submitted through the existing audit RPC. Existing nontransactional creation/conversion and best-effort audit architecture remain; this batch does not certify atomic financial workflows or guarantee recovery from process termination.

How to check on your local machine:

```powershell
git checkout main
git pull origin main
npm.cmd ci
npm.cmd run dev
```

On macOS/Linux use `npm` in place of `npm.cmd`. Preserve local uncommitted work before pulling. Use the existing local app/Supabase configuration; this batch introduces no migration or new credentials.

1. Visit http://localhost:8080, sign in and select an authorized test company. Open Purchases → Purchase orders → New order.
2. Select a supplier and an expense/asset account. Line 1: quantity 2, unit price 50.00, discount 10.00, tax 20%. It should show 90.00 net, 18.00 tax and 108.00 total in a two-decimal currency.
3. Add Line 2, duplicate/reorder/delete a line and enter supplier instructions. Invalid dates, quantity, price, over-discount or tax must prevent saving; empty descriptions/accounts must not save. For JPY/KWD use their native currency precision.
4. Save and choose Open saved order. Reload the detail URL: lines, ordering, memo, discounts and totals must persist. Open Print / Save as PDF; check the discount and totals. Notes/files use the existing shared panel.
5. Back on the list, search the order number or supplier, choose a status and export CSV. The currency must match each individual order, including a foreign-currency supplier's order.
6. Mark a draft as sent. The toast explains that no email was sent. Existing email controls require transport configuration and a sendable document; any actual provider result remains in delivery history.
7. Cancel an unbilled draft/sent order through its confirmation dialog. It stays in the list and cannot be billed. Do not cancel a real commercial order merely for testing.
8. Convert a separate order to a draft bill. It must retain lines, discounts and supplier payment terms. The order links to the bill, and the bill must remain draft until separately authorised.
9. Fractional regression: quantity 1.5, price 10.01, discount 0, tax 0 in a two-decimal currency. The existing engine produces 15.01 net. Conversion and saving the draft bill must preserve 15.01 and zero discount.
10. With read-only purchasing access, detail/print remain governed by existing permissions; status/conversion/create controls must not be offered. A forged server mutation without `purchases.draft` must fail.

Next for this task: atomic PostgreSQL create/convert/audit, editable drafts, PO approval/receipt/return workflows, partial billing/matching and server pagination/search. These require additional implementation and authenticated integration evidence.

## Task 2: truthful Settings integration readiness

Implemented:

- Shared safe integration state used by Settings Overview and Integrations. Document email distinguishes Configured, Not configured and Restricted in Demo Company.
- Read server transport configuration without returning API keys or sender configuration. Configured means credentials are present; it does not assert a verified domain, working provider or successful delivery.
- Remove hard-coded “Unavailable” badges and the false missing-email warning when transport is configured. Inaccessible/failed company lookups return an error instead of fabricated readiness.
- Integrations has Refresh status and Check email delivery links to the existing Notifications & Communications panel. Live FX, bank aggregators and payment gateways remain explicitly unavailable.
- Does not label invite delivery as implemented merely because document email is configured. No email was sent by this task.

How to check locally:

1. Open Settings → Overview and Settings → Integrations. Without the existing server `RESEND_API_KEY` and `EMAIL_FROM` configuration, document email must say Not configured.
2. If you already have an authorized real sender configured in the server environment, restart the local app. For a non-demo test company both panels must say Configured. Do not put provider secrets in browser code or Git.
3. In Demo Company it must say Restricted in Demo Company, regardless of whether the server has credentials.
4. Refresh status, then choose Check email delivery. This opens the existing communications panel; verified sender/provider delivery remain separate checks. No automatic message is sent by visiting either panel.
5. Check the browser response for the readiness endpoint: it contains names/status/details, no API token or sender address.

Next for this task: verify actual sender/domain and delivery using authorized provider configuration, complete invitation delivery, and implement the missing FX/banking/payment providers. There is no schema change in this task.

## Verification and release boundary

See the final validation checkpoint appended below. Focused tests exercise real validators/mappers and server handlers with mocked transport/database authority. They cover amount/precision/discount preservation, denied permissions, tenant filters, state conflicts, provisional draft cleanup, multi-line persistence shapes and secret-safe readiness. They are not live PostgreSQL/RLS or authenticated browser proof.

The environment has no callable supported browser automation tool or `cua_repl.js`, and no dedicated authenticated staging account was configured. UI preview and browser→server→database acceptance are unverified. No production database or provider messages were used for testing.

The full source audit/backlog is [ACCOUNTING_PARITY_AUDIT_20261103.md](ACCOUNTING_PARITY_AUDIT_20261103.md). Full Xero/Odoo feature parity remains pending.

### Final local validation checkpoint

- Full unit suite: **1,708 passed in 238 files**, including the preserved current-main reporting work.
- Focused purchasing/readiness suite: **59 passed in 5 files**.
- TypeScript: passed.
- Whole-repository ESLint: **0 errors, 20 existing warnings**; the final Settings prop correction also passed its targeted lint check.
- Lookup architecture: **132 declarations, 0 violations**.
- Native navigation source audit: passed (23 files, 11 reporting tabs).
- Production build: passed with existing framework/chunk-size warnings.
- Diff whitespace: passed.
- Authenticated browser/live PostgreSQL/RLS/provider-delivery acceptance: **not run**.

Prepared branch: `feature/accounting-parity-purchase-orders`, based on main `96236b9`. Merge/CI outcome is recorded by the linked GitHub PR and final handoff; this document does not infer it from local checks.
