# Stripe setup for StreakBooks (minimal path)

StreakBooks uses **Stripe Checkout** in subscription mode. You do **not** need to finish Stripe’s in-dashboard “setup guide” (recurring products, customer portal, Payment Links, and so on) for the app to work.

## What you can ignore in Stripe

| Dashboard area | Needed for StreakBooks? |
| ---------------- | ------------------------ |
| **Product catalogue** / Create recurring product | **No** — prices come from Supabase; Stripe Products are created on first checkout |
| **Subscriptions → Create test subscription** | **No** — subscribe from **Settings → Subscription** in the app |
| **Billing → Customer portal** | Optional — StreakBooks has its own subscription UI; portal is only for “Manage billing” when already on Stripe |
| **Connect** | **No** unless you build marketplace payouts |
| **Business / Tax / Payouts** (full live onboarding) | **No** for **test mode**; required before **live** charges |

An incomplete Stripe **Setup guide** chip is normal while you are only using **test mode** + API keys.

## Minimum checklist (local dev, UK / GBP org)

1. **Test mode** on (top-right in Stripe).
2. **Developers → API keys** → copy **Secret key** `sk_test_…`.
3. **`~/Projects/streakbooks/.env.local`** (server only, never `VITE_`):

   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   SUPABASE_URL=https://qugoaaizclvkzesptovm.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   APP_ORIGIN=http://localhost:8080
   ```

4. **Webhooks (local)** — second terminal:

   ```bash
   stripe listen --forward-to localhost:8080/api/billing/stripe
   ```

   Put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.

5. In the app: **Settings → Subscription** → **Subscribe** → test card `4242 4242 4242 4242`.

After payment, Stripe returns to Settings with `checkout=success&session_id=cs_…`. The app **confirms the Checkout session on the server** (same database path as webhooks), so the subscription turns on even if `stripe listen` was not running. Webhooks remain the primary path in production; keep step 4 for invoice sync and renewals.

## Checkout branding (optional)

StreakBooks uses **hosted Stripe Checkout** for first subscribe, and Stripe’s **hosted invoice page** for mid-cycle upgrades (prorated difference). Both leave the app briefly, then return — same model as many accounting products. Brand the pages in Stripe **Settings → Branding** (logo, accent color).

## Where to click in Stripe (your Settings screenshot)

- **Personal settings → Developers** — API keys, webhook endpoints (production), Workbench logs.
- **Account settings → Business** — only when going live.
- **Product settings → Payments** — defaults for Checkout; StreakBooks still sends customers to hosted Checkout with mapped prices.

## India

New Stripe accounts with **country = India** may be **invite-only**. For **GB/US** test checkouts use a Stripe account registered in that market. For **INR** orgs, StreakBooks routes **Razorpay** instead of Stripe (`RAZORPAY_*` keys in `.env.local`).

## Production (Vercel)

Add the same server env vars on Vercel (not `VITE_*`). Create a **live or test** webhook endpoint:

`https://<your-app>/api/billing/stripe`

Subscribe to the events listed in `06-payment-integration.md`.

See also `13-runbook.md` and `06-payment-integration.md`.