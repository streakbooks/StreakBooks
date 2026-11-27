# Mid-cycle plan upgrade — verification evidence (PR #98)

**Status:** Sandbox / automated verification in progress. **Not production-ready** until every critical scenario below is Pass.

**Rules:** Test-mode provider keys only (`sk_test_`, `rzp_test_`). `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS` must remain unset. Do not merge on unit tests alone.

## How to re-run

```bash
# Connectivity (no mutations beyond GET)
npm run verify:razorpay

# Razorpay Test Mode plan-change suite
npm run test:billing:sandbox:razorpay

# Stripe Test Clock full journey (proration, zero-charge, renewal, failure recovery)
npm run test:billing:sandbox:stripe

# Isolated Postgres billing (pending_payment does not grant plan; webhook dedupe; reverse)
npm run test:billing:postgres

# Authenticated app UI (requires dedicated test user — never commit credentials)
E2E_BILLING_ENABLED=true E2E_BILLING_MUTATIONS=true \
  E2E_EMAIL=… E2E_PASSWORD=… E2E_BASE_URL=http://localhost:8080 \
  npm run test:billing:live
```

## Scenario matrix

| # | Scenario | Automation | Result | Notes |
| --- | --- | --- | --- | --- |
| R1 | Razorpay test credentials configured securely | `verify:razorpay` | **Pass** | `.env.local` gitignored; `rzp_test_` + `RAZORPAY_MODE=test` |
| R2 | Card mandate identification from notes | `RAZORPAY_SANDBOX=1` | **Pass** | `pay_method=card\|upi\|emandate` on created subs |
| R3 | Immediate mid-cycle upgrade (card, charged amount) | Sandbox API | **Partial** | `RAZORPAY_SANDBOX=1`: card sub created + inspect OK; PATCH `now` on pre-auth `created` mandate rejected by Razorpay (expected). Charge/tax/renewal need Dashboard-authenticated card mandate |
| R4 | UPI / e-mandate unsupported | App + sandbox | **Pass** | `razorpaySupportsImmediatePlanChange` false; UI Got it path |
| R5 | Payment failure / delayed / duplicate webhook | SQL + signatures | **Pass (SQL/sig)** | `billing_webhook_receive` dedupe; Razorpay HMAC redelivery valid; delayed apply covered in billing-04 |
| R6 | Charged amount, tax, renewal date (Razorpay) | Manual Dashboard | **Not verified** | Blocked until authenticated card mandate exists in Test Mode |
| R7 | Entitlements only after provider confirmation | SQL billing-04 | **Pass** | `pending_payment` leaves `plan_code` unchanged until provider event |
| S1 | Authenticated org upgrade via app UI | Playwright live | **Blocked** | `E2E_EMAIL` / `E2E_PASSWORD` not present in this environment |
| S2 | Monthly + annual upgrades | Stripe Test Clock | **Pass** | `npm run test:billing:sandbox:stripe` — 6 passed / 1 skipped (2026-11-27) |
| S3 | Zero-charge upgrade (already on price) | Stripe Test Clock | **Pass** | `alreadyOnPrice` + `amountDueMinor=0` after same-price confirm |
| S4 | Failed payment + recovery | Stripe Test Clock | **Pass** | Fail token + Visa restore path in full clock journey |
| S5 | Proration + invoice + renewal preservation | Stripe Test Clock | **Pass** | Shared `prorationDateUnix`; same-interval `current_period_end` preserved; invoice pay path |
| S6 | 3DS authentication recovery | Stripe | **Not verified** | Requires PaymentIntent that demands SCA; not covered by Visa `tok_visa` clock path |
| D1 | Provider lock + `company_subscriptions` consistency | SQL + code review | **Pass (SQL)** | Prepare uses locked provider; pending never mutates plan |
| D2 | Idempotency / concurrent confirm | Stripe keys | **Pass** | Key stable per company + full price id + kind + 60s bucket; retry covered in clock journey |
| D3 | Rollback after provider failure | SQL billing-04 | **Pass** | Cancel confirm failure leaves subscription running |
| C1 | PR-touched ESLint clean | eslint path list | **Pass** | No mass-format; repo-wide Prettier debt remains on `main` |

## Failed / blocked scenario analysis

1. **Razorpay immediate charge evidence (R3/R6):** Creating a subscription via API leaves status `created`. Razorpay rejects in-place plan updates until the mandate is authenticated in Checkout. Next step: complete one Test Mode **card** checkout for an India org, then re-run upgrade against that `sub_*` and capture invoice/adjustment amounts from the Dashboard or `subscription.charged` webhook.
2. **Authenticated Stripe UI (S1):** No `E2E_*` credentials in the agent environment. Provide a dedicated Stripe-test org user (non-production) to run `npm run test:billing:live`.
3. **3DS (S6):** Test Clock Visa path does not force SCA. Use Stripe test cards that require authentication on a hosted invoice payment URL when UI credentials are available.
4. **CI validate lint:** Unrelated Prettier debt (~3k files on `main`) still fails `eslint .`. Tracked separately; not introduced by PR-touched files.

## Production readiness checklist

- [ ] All R* and S* critical rows are Pass (not Partial / Blocked)
- [ ] Authenticated India card upgrade shows due-today + tax + renewal in UI matching provider
- [ ] Authenticated Stripe monthly/annual upgrade via Settings → Subscription
- [ ] Failed payment keeps prior plan; recovery restores access
- [ ] Duplicate webhook does not double-apply entitlements
- [ ] No live keys (`sk_live_` / `rzp_live_`) used in verification
- [ ] Ops sign-off recorded in PR before merge authorisation

**Verdict as of this document:** **Not production ready** — Razorpay charged-amount path and authenticated Stripe UI remain open.
