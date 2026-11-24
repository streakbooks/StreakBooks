# Billing platform — REST API v1

Phase 9. Router `src/lib/billing/api/v1/router.server.ts` (wired in `src/server.ts` for
`/api/v1/*`); contracts `src/lib/billing/api/v1/contracts.ts`; generated OpenAPI 3.1 document
[`openapi.json`](openapi.json), also served at `GET /api/v1/openapi.json`. Regenerate it with
`npm run openapi:billing`; a unit test fails if the committed document drifts from the contracts.

## Principles

- Handlers are thin: they call the same database functions and shared server code as the app, so
  REST and UI cannot disagree. Every permission, MFA, two-person and accounting rule stays in the
  database.
- All amounts are integer minor units. Prices, tax and discounts are computed on the server.
- Requests are validated strictly (unknown fields are refused). Bodies are JSON, at most 64 KB.
- No CORS headers are sent; browsers on other origins cannot call the API.

## Envelope

```json
{ "data": {}, "error": null, "meta": { "requestId": "…" } }
```

Errors use `{ "data": null, "error": { "code", "message", "details" }, "meta" }` and the request ID
is echoed in `x-request-id`. Responses are `cache-control: no-store`.

| Status | Code                                                          | When                                                   |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| 400    | `validation_error`                                            | Path, query or body fails its schema                   |
| 401    | `unauthenticated`                                             | Missing or invalid token or API key                    |
| 403    | `forbidden`                                                   | The database refused (`42501`) or a scope is missing   |
| 404    | `not_found`                                                   | Unknown endpoint                                       |
| 405    | `method_not_allowed`                                          | Wrong method (`Allow` header lists valid ones)         |
| 409    | `conflict`, `idempotency_conflict`, `idempotency_in_progress` | Duplicate, stale version, overlapping rule, reused key |
| 422    | `unprocessable`                                               | A business rule refused the request                    |
| 500    | `internal`                                                    | Unexpected; details are logged, not returned           |

## Authentication

| Caller            | How                                                        | Endpoints                           |
| ----------------- | ---------------------------------------------------------- | ----------------------------------- |
| Anyone            | none                                                       | Pricing price list, legal documents |
| Signed-in user    | `Authorization: Bearer <Supabase access token>`            | Customer and partner endpoints      |
| Platform staff    | Bearer token with an MFA (aal2) session and `billing.view` | `/api/v1/admin/billing/*`           |
| External system   | `X-Api-Key: <key>` with the required scope                 | `/api/v1/admin/billing/*` only      |
| Payment providers | Provider signature                                         | `/api/v1/webhooks/*`                |

API keys extend `platform_api_keys`: only the SHA-256 hash is stored, the raw key is shown once
(Superadmin → Platform billing → Billing API keys), and only platform owners grant scopes
(`billing:read`, `billing:analytics`). Grants are audited; retired keys stop working at once.

## Idempotency

Mutations accept `Idempotency-Key` (8–128 of `A-Z a-z 0-9 _ . : -`). Keys are per user and kept
for 24 hours. A repeat with the same body returns the stored response with
`idempotent-replayed: true`; a different body is `409 idempotency_conflict`; a repeat while the
first is running is `409 idempotency_in_progress`; a server error releases the key.

## Endpoints

| Method | Path                                   | Auth      | Notes                                                                         |
| ------ | -------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| GET    | `/api/v1/openapi.json`                 | public    | This contract                                                                 |
| GET    | `/api/v1/pricing/price-list?country=`  | public    | Published prices for a country                                                |
| GET    | `/api/v1/legal-documents?locale=`      | public    | Published terms, policies and disclosures                                     |
| GET    | `/api/v1/pricing/quote`                | user      | `companyId`, `planCode`, `interval`, optional `coupon`                        |
| GET    | `/api/v1/subscriptions/current`        | user      | State, eligibility and history                                                |
| POST   | `/api/v1/subscriptions/trial`          | user      | Starts the trial                                                              |
| POST   | `/api/v1/subscriptions/checkout`       | user      | Returns a provider-hosted checkout URL; no card data passes through StreakBooks |
| POST   | `/api/v1/subscriptions/plan-change`    | user      | Upgrade after payment, downgrade at renewal                                   |
| POST   | `/api/v1/subscriptions/cancel`         | user      | Needs `confirm: true` and the current policy ID                               |
| POST   | `/api/v1/subscriptions/cancel/reverse` | user      | Where the provider allows it                                                  |
| GET    | `/api/v1/billing/account`              | user      | Billing account for an organisation                                           |
| PUT    | `/api/v1/billing/tax-id`               | user      | Set or clear the customer tax ID                                              |
| GET    | `/api/v1/invoices`                     | user      | Invoices and credit notes                                                     |
| GET    | `/api/v1/invoices/{id}`                | user      | Detail                                                                        |
| GET    | `/api/v1/invoices/{id}/pdf`            | user      | Signed link valid for 60 seconds                                              |
| GET    | `/api/v1/credit-notes/{id}` and `/pdf` | user      | As invoices                                                                   |
| GET    | `/api/v1/referrals`                    | user      | Programme state, current partner, disclosure                                  |
| POST   | `/api/v1/referrals`                    | user      | Needs `accepted: true` and the current disclosure ID                          |
| GET    | `/api/v1/partners/me`                  | user      | Partner memberships, codes, ledger, payouts                                   |
| POST   | `/api/v1/partners/register`            | user      | Firm owner or admin applies                                                   |
| POST   | `/api/v1/partners/{partnerId}/codes`   | user      | Partner admin creates a referral code                                         |
| POST   | `/api/v1/webhooks/stripe`, `/razorpay` | signature | Aliases of `/api/billing/*`; verified, stored, processed                      |
| GET    | `/api/v1/admin/billing/invoices`       | platform  | `from`, `to`, `cursor`, `limit` (max 200), oldest first                       |
| GET    | `/api/v1/admin/billing/payments`       | platform  | As invoices                                                                   |
| GET    | `/api/v1/admin/billing/subscriptions`  | platform  | `cursor`, `limit`                                                             |

Admin lists use keyset cursors (`nextCursor` is null on the last page) and include customer
details from issued invoices, so keys with `billing:read` must be treated as confidential.

## Not in v1

Superadmin write operations (prices, rules, refunds, payouts) stay in the Superadmin screens,
where MFA sessions and two-person approval are enforced interactively. Rate limiting is left to
the hosting platform's firewall.
