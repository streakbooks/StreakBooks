# Public Advisors checkout

Public service purchases are owned by Link Business Advisory and are stored separately from
StreakBooks company subscriptions. The current provider implementation uses a dedicated Razorpay
merchant account; do not configure it with the StreakBooks Razorpay key pair.

## Server environment

Configure these variables in local development and in the server deployment environment. Use the
key ID, key secret, and webhook secret created in the Link Business Advisory Razorpay account:

```dotenv
ADVISORS_RAZORPAY_KEY_ID=rzp_test_...
ADVISORS_RAZORPAY_KEY_SECRET=...
ADVISORS_RAZORPAY_WEBHOOK_SECRET=...
# Set to true only after Link Business Advisory live payments are approved.
ADVISORS_ALLOW_LIVE_PAYMENT_KEYS=false
```

Keep all three server-only. The key ID is returned only to the browser for Checkout.js; the key
secret and webhook secret must never use a frontend-prefixed variable. Supabase server access also
requires the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables.

Set the Razorpay webhook URL to `/api/advisors/razorpay-webhook` and subscribe to the subscription
events `subscription.authenticated`, `subscription.activated`, `subscription.charged`,
`subscription.halted`, `subscription.cancelled`, and `subscription.completed`. The webhook secret
must match `ADVISORS_RAZORPAY_WEBHOOK_SECRET`.

## Database setup

Apply `supabase/migrations/20261125164222_advisors_razorpay_public_checkout.sql` to the intended
Supabase project before enabling the checkout. It creates an isolated Advisors purchase table and
server-only RPCs; it does not modify company subscriptions. This migration has not been applied by
this code change.

The currently implemented public payment provider is Razorpay. Supporting Stripe for Advisors
requires a separate Link Business Advisory Stripe account, dedicated server credentials, and its
own checkout/webhook flow; the existing StreakBooks Stripe integration must not be reused for
these purchases.
