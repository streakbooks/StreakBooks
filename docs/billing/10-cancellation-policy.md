# Billing platform — subscription lifecycle and cancellation

Phase 4. Migrations `20261105175644_billing_legal_documents.sql` and
`20261105175645_billing_subscription_lifecycle.sql`; domain rules
`src/lib/billing/domain/lifecycle.ts`; server functions
`src/lib/billing/subscription-lifecycle.functions.ts` and `legal-documents.functions.ts`; customer UI
`src/components/billing/SubscriptionLifecycle.tsx` (Settings → Subscription); admin UI
`src/components/platform/billing/LegalDocumentsAdmin.tsx` (Superadmin → Platform billing).

This document describes system behaviour. It is not customer-facing legal wording; that wording is
written in the legal documents workflow and needs legal review before it is published.

## Statuses and access

| Status          | Access                                                       | How it is reached                                   |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `trialing`      | Full until the trial end                                     | Signup trial (phase 2) or manual trial              |
| `active`        | Full until the period end                                    | Verified provider payment (phase 5)                 |
| `past_due`      | Existing grace rule (`billing_settings.past_due_grace_days`) | Failed renewal (provider)                           |
| `paused`        | Read-only                                                    | Platform staff only (D17)                           |
| `cancelled`     | Read-only                                                    | A scheduled cancellation reached its effective date |
| `expired`       | Read-only                                                    | A trial ended without a plan                        |
| `complimentary` | Full                                                         | Demo organisations                                  |

Access is decided by `subscription_allows_posting` (database) and `subscriptionAccess` (app). A
scheduled cancellation does not change access: the subscription keeps its status with
`cancel_at_period_end = true` until the effective date.

## Cancellation

- Who: people with `billing.manage` (owner and admin by default).
- Confirmation: explicit checkbox. If a cancellation policy is published, it is shown and its id must
  be confirmed; if it changed since the page loaded the request is refused (`40001`) and the customer
  reviews it again. The policy version and an acceptance record are stored with the request.
- Effective date: trial end for trials, period end for active subscriptions, immediately for past-due
  subscriptions or periods that have already ended.
- Reversal: any time before the effective date ("Keep my subscription").
- Notice: a confirmation e-mail through the existing Resend transport when `RESEND_API_KEY` and
  `EMAIL_FROM` are configured; the outcome is recorded on the request and in `email_outbox`.
- Card and mandate subscriptions (Stripe, Razorpay) are cancelled through Manage billing until phase 5
  adds provider cancellation, so the provider never keeps charging a cancelled account.
- Demo and complimentary organisations cannot be cancelled; paused subscriptions are handled by
  support.
- No automatic refund on cancellation (D16); refunds stay admin-approved.

Reason codes: too expensive, missing features, switching provider, not using, business closed,
other (optional), plus an optional note of up to 1000 characters.

## Lifecycle sweep

`billing.run_lifecycle_sweep()` runs every 15 minutes as the `billing_lifecycle` job of the existing
platform worker (`pg_cron` → `private.platform_worker_tick`), with that worker's retries and dead
letter. Each run is bounded and idempotent:

1. Scheduled cancellations whose date has passed become `cancelled`.
2. Trials without a provider whose end has passed become `expired`.
3. Scheduled plan changes on subscriptions without a provider are applied with the published version.
4. Each past-due subscription raises one `past_due_alert` per billing period.

Not invented (D9, D10): payment retry schedule, grace changes and trial reminder schedule. Past-due
subscriptions are never expired by the sweep; no reminders are sent. A failed run can be retried from
the platform job console; manual enqueue of this job is not offered.

## History and audit

Every change to a subscription's status, plan, cancellation flag or scheduled plan is written by a
trigger to `billing.subscription_events` (append-only) with the source (customer, platform, job,
provider/system, migration) and actor. Customers see the last 50 events. Cancellations, reversals,
pause and resume are also written to the hash-chained `platform_billing_audit`.

## Legal documents

Kinds: terms of service, privacy policy, refund policy, cancellation policy, recurring payment
authorisation, partner terms, partner disclosure. None are seeded.

1. Platform staff draft a version (title and text); it is marked "requires legal review".
2. A platform owner other than the author approves it after legal review; the text is then immutable
   (SHA-256 stored).
3. A platform owner publishes it; the previous published version of that kind and language is retired.

Acceptances are append-only and store the document version, user, organisation, context and an
HMAC of the client address when `BILLING_IP_HASH_SECRET` is configured (otherwise no address data).

## Pause and resume (D17)

Platform staff with `billing.manage` (aal2) can pause a trial or active subscription without a
payment provider and resume it to its previous status (an ended trial resumes as expired). Provider
subscriptions are paused at the provider. Server functions exist (`pauseSubscription`,
`resumeSubscription`); a dedicated admin screen arrives with phase 10.
