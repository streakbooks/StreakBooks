# Razorpay Test Mode setup (India)

StreakBooks routes India → Razorpay and international → Stripe. This guide configures **Test Mode only**. Never enable live payments locally (`STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS` must stay unset / not `true`).

## 1. Local environment

Add these **server-only** variables to `.env.local` (never commit; never paste into chat):

```bash
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_MODE=test
```

Leave Stripe variables unchanged. Key ID must start with `rzp_test_`. `.gitignore` already ignores `.env` and `.env.*`.

### Verify without printing secrets

```bash
node scripts/verify-razorpay-connectivity.mjs
```

Success means: env present, test key prefix, API authentication OK, **no subscriptions created**.

### Create / reuse INR plan mappings

```bash
node scripts/setup-razorpay-test-plans.mjs
```

Maps STANDARD / PRO / BUSINESS × monthly / annual (published India INR amounts) into `billing.provider_price_mappings` for `provider=razorpay`, `mode=test`. Safe to re-run.

## 2. Razorpay Dashboard — webhook

Canonical StreakBooks endpoints (same handler):

- `POST https://<APP_ORIGIN>/api/billing/razorpay`
- `POST https://<APP_ORIGIN>/api/v1/webhooks/razorpay` (alias)

Local development: expose `http://localhost:8080` with a tunnel (ngrok / Cloudflare Tunnel), then use that public HTTPS URL.

### Dashboard steps

1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/) → switch to **Test Mode**.
2. **Account & Settings** → **Webhooks** → **Add New Webhook** (or edit existing Test webhook).
3. **Webhook URL**: `https://<your-public-host>/api/billing/razorpay`
4. **Secret**: generate a webhook secret; put the same value in `RAZORPAY_WEBHOOK_SECRET` (separate from API Key Secret).
5. **Alert Email**: your ops email.
6. Enable at least these events (Subscriptions):

| Event | Why StreakBooks needs it |
| --- | --- |
| `subscription.authenticated` | Mandate authorised; may start trial (`start_at`) |
| `subscription.activated` | Authoritative activation → entitlements |
| `subscription.charged` | Recurring payment + invoice row |
| `subscription.pending` | Failed charge / recovery window → past_due path |
| `subscription.halted` | Retries exhausted |
| `subscription.paused` / `subscription.resumed` | Pause/resume state |
| `subscription.updated` | Scheduled plan change applied at cycle end |
| `subscription.cancelled` | Cancellation |
| `subscription.completed` | Cycle count exhausted |
| `subscription.expired` | Expired mandate / subscription |

7. Save. Razorpay signs with `X-Razorpay-Signature` (HMAC SHA256 of raw body). StreakBooks also requires `X-Razorpay-Event-Id` for durable inbox dedupe.

### Behaviour guarantees

- Signature verified before storage.
- Durable inbox (`billing_webhook_receive`) dedupes by provider event id.
- Stale / out-of-order events skipped by `billing_apply_provider_event`.
- Failures schedule retry; endpoint returns 500 so Razorpay redelivers.
- Browser redirects **never** grant paid access.

## 3. Checkout journey (India)

1. Organisation country / billing country = `IN`.
2. Price list shows INR; providers = `["razorpay"]` only.
3. Checkout creates a Razorpay subscription with mapped `plan_id` and opens hosted Checkout (`short_url`).
4. Customer completes Test Mode authorisation (UPI / card / e-mandate as offered).
5. Webhooks activate `company_subscriptions` and entitlements.
6. Stripe remains the path for non-India orgs; existing Stripe customers stay locked to Stripe.

## 4. Test cards / UPI

Use Razorpay’s official Test Mode payment methods from their docs (Dashboard → Test Mode). Do not use live instruments.

## 5. npm scripts

```bash
npm run verify:razorpay
npm run setup:razorpay:plans
```
