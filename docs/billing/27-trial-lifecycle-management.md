# Trial lifecycle management

## Current journey (after this change)

1. **Signup** — company trigger creates no-card trial when plan `trial_enabled` and eligibility pass.
2. **Policy** — `billing.resolve_trial_policy` resolves plan → country → global (`billing.trial_policy`).
3. **Reminders** — `billing.schedule_trial_reminders` creates durable jobs (welcome, d7, d3, d1, expired).
4. **Delivery** — `/api/billing/webhook-retry` cron runs `ensureAndProcessTrialReminders` (email via Resend + in-app `action_notifications`).
5. **Extend** — `platform_extend_company_trial` updates `trial_ends_at`, writes `billing.trial_extensions`, reschedules reminders.
6. **Paid convert** — checkout omits no-card trial carry (`trialEndUnixForPaidCheckout`); trigger cancels pending reminders when provider becomes stripe/razorpay.
7. **Expiry** — `billing.run_lifecycle_sweep` expires no-card trials; expired reminder fires; data retained (read-only policy flag).
8. **After purchase free month** — `billing.subscription_access_grants` complimentary grant (does not fake payments or cancel mandates).

## Admin UI

`/platform/billing` → **Trial Management** + **Customer subscription administration**.

## Migrations

- `20261128140000_billing_subscription_access_admin.sql` — grants + basic extend
- `20261128150000_billing_trial_lifecycle.sql` — policy, reminders, extensions history

Do not apply to production without explicit approval.
