# Staging / Preview environment checklist

Do **not** paste secrets into chat. Configure in Vercel → Project → Settings → Environment Variables, and locally in `.env.local`.

Project: `paxaris/streakbooks` · Site: https://streakbooks.vercel.app

## Current gap (verified 2026-11-27)

Vercel currently has **Supabase variables only**. Missing payment vars cause:

- Banner: Stripe/Razorpay is not connected on this server
- Buttons: Setup required (after UX fix) — previously mislabeled “Available soon”
- Errors: `Stripe is not configured. Add a test secret on the server.`

## Required server variables (never `VITE_`)

Apply to **Preview** and **Production** (and Development for local `vercel env pull`). Use **Test Mode** keys only until go-live.

| Variable                         | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `STRIPE_SECRET_KEY`              | `sk_test_…` Stripe API                             |
| `STRIPE_WEBHOOK_SECRET`          | `whsec_…` for `/api/billing/stripe`                |
| `RAZORPAY_KEY_ID`                | `rzp_test_…`                                       |
| `RAZORPAY_KEY_SECRET`            | Razorpay API secret                                |
| `RAZORPAY_WEBHOOK_SECRET`        | Dashboard webhook secret (≠ API secret)            |
| `RAZORPAY_MODE`                  | `test`                                             |
| `STREAKBOOKS_CRON_SECRET`        | Auth for `/api/billing/webhook-retry`              |
| `CRON_SECRET`                    | Same value as above (Vercel Cron Bearer)           |
| `APP_ORIGIN`                     | Canonical app URL (Preview URL or production host) |
| `SUPABASE_*` / `VITE_SUPABASE_*` | Already present                                    |

Do **not** set `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true` on staging.

## After adding vars

1. Redeploy Preview (or Production).
2. Local: `npm run verify:razorpay` then `npm run setup:razorpay:plans`.
3. Stripe Dashboard (Test): webhook → `https://<host>/api/billing/stripe`.
4. Razorpay Dashboard (Test): webhook → `https://<host>/api/billing/razorpay` (events in `22-razorpay-test-mode-setup.md`).

## Hybrid routing (DB)

| Country     | Provider      |
| ----------- | ------------- |
| IN          | Razorpay only |
| GB / US / … | Stripe only   |

## Acceptance smoke

- GB/US org: Stripe checkout opens (not “Setup required”).
- IN org: Razorpay hosted checkout opens.
- Unsigned webhook POST → 400.
- Paid access only after verified webhook (or Stripe server confirm path).
