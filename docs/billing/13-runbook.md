# Billing platform — operations runbook

For platform owners and on-call engineers. Every action below that changes money, settings or
access is audited and, where marked, needs a second platform owner.

## 1. Deploying the database changes

The billing migrations (`20261105161752` to `20261105231127`, file names containing `_billing_`)
were applied to production on 6 November 2026 (see `04-database-design.md`).

Do **not** use `supabase db push` on this project: its history records many older repository
migrations under different versions, so a push would try to re-run them. Apply new migrations
individually:

1. Take a backup or confirm point-in-time recovery is available.
2. Dry run: wrap the migration in `BEGIN; … ROLLBACK;` and run it with
   `supabase db query --remote --file <file>`.
3. Apply it in one transaction together with its `supabase_migrations.schema_migrations` row
   (repository version and name).
4. Verify with read-only queries (`supabase db query --remote --read-only`) and
   `supabase db advisors --remote`.
5. Regenerate types if the app is changed to use them (`supabase gen types`).

Rolling back is forward-only: billing tables hold immutable financial records. Fix forward with a
new migration; do not drop tables with data.

## 2. Configuration

Server-only environment (never `VITE_`):

| Variable                                                                | Purpose                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database access (service role only on the server)             |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                            | Stripe (test keys until go-live)                              |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_MODE=test` | Razorpay Test Mode (see `22-razorpay-test-mode-setup.md`) |
| `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS`                                     | Must be `true` before live keys are accepted; owner decision  |
| `STREAKBOOKS_CRON_SECRET` (and `_PREVIOUS` while rotating)                  | Authenticates `/api/billing/webhook-retry`                    |
| `APP_ORIGIN` or `SITE_URL`                                              | Allowed checkout return origin                                |
| `BILLING_IP_HASH_SECRET`                                                | Keyed hash of client addresses on consents; unset stores none |
| `RESEND_API_KEY`, `EMAIL_FROM`                                          | Cancellation notices                                          |
| `PARTNER_PAYOUTS_ENABLED`                                               | Server brake for partner payouts; leave unset or `false`      |

Provider webhooks: Stripe → `https://<app>/api/v1/webhooks/stripe` (or `/api/billing/stripe`),
Razorpay → `https://<app>/api/v1/webhooks/razorpay`. Event lists are in `06-payment-integration.md`.

Schedule `POST /api/billing/webhook-retry` every 2–5 minutes with the cron secret:

```http
POST https://<app-host>/api/billing/webhook-retry
Authorization: Bearer <STREAKBOOKS_CRON_SECRET>
```

In-repo schedule: `vercel.json` registers `GET /api/billing/webhook-retry` daily at 04:00 UTC (`0 4 * * *`) so Hobby-plan deploys succeed. Use an external scheduler every 2–5 minutes when Pro cron or another host is available.
Set `CRON_SECRET` and `STREAKBOOKS_CRON_SECRET` to the **same** value on Vercel (Cron sends
`Authorization: Bearer <CRON_SECRET>`). External schedulers may POST. Missing secret → HTTP 500;
wrong Bearer → 401; success → `{ "processed", "failed" }`. Details: `18-production-release.md`.

The lifecycle sweep runs inside the existing platform worker tick (`billing_lifecycle`, every 15 minutes).

## 3. Go-live checklist (owner decisions)

- [ ] Legal texts (terms, privacy, refund, cancellation, recurring payment authorisation, partner
      terms and disclosure) drafted, approved by a second owner after legal review, and published.
- [ ] Seller entity, invoice and credit-note series, and approved tax rules per country. Tax labels
      are configuration, not legal advice.
- [ ] Country prices drafted and published by two owners; provider routes per country.
- [ ] Stripe and Razorpay test-mode runs: trial, checkout, renewal, failed payment, upgrade,
      downgrade, cancel and withdraw, refund with credit note, coupon.
- [ ] Live keys installed and `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true` only after the owner says so.
- [ ] Partner programme: stays closed (no attribution window) and payouts stay disabled until the
      commercial terms and the regulatory review (D14, D15) are decided.

## 4. Incidents

| Symptom                                                | Check                                                                               | Action                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Webhook backlog or dead events (analytics, Operations) | Superadmin → Payment operations queue; `billing_events.last_error`                  | Fix the cause (secret, outage), then requeue dead events from the queue. Processing is idempotent and skips stale events. |
| Signature failures                                     | Server logs (no payloads are stored for invalid signatures)                         | Rotate the webhook secret at the provider and on the server together                                                      |
| Payment recorded but no invoice                        | Analytics "payments waiting for an invoice"; `billing.payments.invoice_issue_error` | Add the missing seller, series or tax rule; the next event or retry issues the invoice                                    |
| Cancellation stuck "pending provider"                  | `billing.cancellation_requests.failure`                                             | Resolve at the provider; the customer can retry. Nothing changes in StreakBooks until the provider confirms                 |
| Refund failed                                          | Finance → refunds, `failure`                                                        | Correct at the provider and record the outcome; credit notes are issued only for succeeded refunds                        |
| Wrong price published                                  | Country pricing history                                                             | Publish a corrected version (two owners) or roll back to a previous price-book version; existing subscribers keep theirs  |
| Suspected leaked API key                               | Billing API keys panel, `lastUsedAt`                                                | Rotate (issues a new key and retires the old one at once); review the platform audit                                      |
| Partner dispute                                        | Partner ledger and audit                                                            | Post an owner adjustment with the reference; never edit ledger rows                                                       |

## 5. Kill switches

| Switch                                                     | Effect                                         | Approval                  |
| ---------------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| Country billing off (Payment operations)                   | New checkouts in that country stop             | Platform staff, audited   |
| Provider route change                                      | New checkouts use another provider             | Platform staff, audited   |
| Coupon inactive                                            | Code stops applying; redeemed discounts remain | Platform staff, audited   |
| Partner programme window cleared                           | No new attributions                            | Second owner              |
| Partner payouts flag off / `PARTNER_PAYOUTS_ENABLED` unset | No payout requests, approvals or payments      | Second owner / deployment |
| API key retired                                            | Key stops working immediately                  | Owner, audited            |

## 6. Routine

- Daily: analytics Operations line (backlog, dead events, pending invoices).
- Monthly: capture MRR (`platform_capture_mrr_movements`) and reconcile (`platform_reconcile_mrr`);
  review refunds, credit notes and commission reversals; verify the audit chain
  (`platform_verify_billing_audit_chain`).
- Before each release: the commands in `12-testing.md`.
