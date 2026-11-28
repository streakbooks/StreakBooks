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

Order matters: `140000` creates `subscription_access_grants` and the first `platform_extend_company_trial`; `150000` drops the 3-arg overload and replaces it, then adds reminder/policy tables that reference `companies` and `trial_reminder_config`.

Do not apply to production without explicit approval.

### Staging apply (Supabase project `qugoaaizclvkzesptovm` only after backup)

```powershell
cd D:\StreakBooks
git switch feature/subscription-entitlement-admin
git pull --ff-only
npx supabase db push --linked
# or apply the two SQL files in version order from the Supabase SQL editor
```

### Verification queries

```sql
SELECT version FROM billing.trial_policy WHERE id;
SELECT kind, enabled FROM billing.trial_reminder_config ORDER BY kind;
SELECT count(*) FROM billing.subscription_access_grants;
-- After scheduling for a trial company:
SELECT kind, status, due_at, idempotency_key
  FROM billing.trial_reminder_jobs
 WHERE company_id = '<company_uuid>'
 ORDER BY due_at;
-- Complimentary uniqueness:
SELECT company_id, count(*) FILTER (WHERE status = 'active') AS active_grants
  FROM billing.subscription_access_grants
 GROUP BY company_id
HAVING count(*) FILTER (WHERE status = 'active') > 1;
```

### Cron / reminder smoke

```powershell
# Requires STREAKBOOKS_CRON_SECRET on the deployed host
Invoke-WebRequest -Method GET -Uri "https://<host>/api/billing/webhook-retry" `
  -Headers @{ Authorization = "Bearer $env:STREAKBOOKS_CRON_SECRET" }
```

Expect HTTP 200. Then confirm `billing.trial_reminder_jobs.status` moves pending → sent (or failed with retry `due_at`).

### Rollback / recovery

- Reminder jobs: `UPDATE billing.trial_reminder_jobs SET status = 'cancelled' WHERE status IN ('pending','failed');`
- Policy: restore from `billing.trial_policy_versions` snapshot (manual UPDATE of `billing.trial_policy`).
- Do **not** drop `subscription_access_grants` while active complimentary customers exist; revoke via `platform_revoke_subscription_access` instead.
- SQL migrations are forward-only; reverse by deploying a corrective migration, not by deleting applied versions.
