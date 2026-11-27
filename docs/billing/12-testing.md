# Billing platform — testing

Automated tests never call payment providers and never use live keys. Server code refuses live
Stripe and Razorpay keys unless `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true`.

## Layers

| Layer               | Command                                                                                                          | What it proves                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Database (Docker)   | `npm run test:billing:postgres`                                                                                  | Every billing migration applies twice on PostgreSQL 17, then ten suites exercise RLS, RPC permissions and rules |
| Unit                | `npx vitest run src/lib/billing`                                                                                 | Money, pricing, tax, lifecycle, partner maths; provider request bodies and webhook normalisation; REST router   |
| Browser (fixtures)  | `npm run test:billing:e2e`                                                                                       | Production components against in-memory adapters: referral disclosure, partner portal, partner admin, analytics |
| Contract            | `npm run openapi:billing`                                                                                        | Regenerates `docs/billing/openapi.json`; the unit run fails if the committed document drifts                    |
| Platform regression | `npm run test:platform:postgres`                                                                                 | Existing Superadmin SQL suites still pass                                                                       |
| Static              | `npm run typecheck`, `npm run lint`, `npm run check:lookups`, `check:navigation`, `check:ui`, `check:repository` | Types, lint, LookupSelect rule, navigation and UI contracts                                                     |
| Build               | `npm run build`, `npm run check:bundle`                                                                          | Import protection keeps server-only code out of the browser bundle; bundle budget                               |

Browser fixtures verify component behaviour only. They do not persist anything and are not
evidence of live API or database behaviour; the SQL suites are.

## SQL suites

Suites run in file-name order against one database seeded by `tests/fixtures/billing/*.sql`
(synthetic shapes of the live tables, not a replay of the production history).

| Suite                              | Checks | Focus                                                                 |
| ---------------------------------- | -----: | --------------------------------------------------------------------- |
| `billing-01-accounts.sql`          |     54 | Billing accounts, audit chain, tenant isolation                       |
| `billing-02-plans.sql`             |     59 | Plans, trials, entitlements, two-person publishing                    |
| `billing-03-pricing.sql`           |     60 | Country prices, FX snapshots, publishing                              |
| `billing-04-provider-payments.sql` |     54 | Webhook store, provider events, checkout guards, plan changes         |
| `billing-05-subscriptions.sql`     |     52 | Lifecycle, cancellation policy, history, worker sweep                 |
| `billing-06-tax-invoicing.sql`     |     60 | Sellers, numbering, tax rules, invoices, refunds, credit notes        |
| `billing-07-coupons.sql`           |     37 | Coupon rules, reservations, redemption, invoice discounts             |
| `billing-08-partners.sql`          |     57 | Partner approval, disclosure, attribution, commission ledger, payouts |
| `billing-09-api.sql`               |     34 | API key scopes, idempotency, read models                              |
| `billing-10-analytics.sql`         |     19 | Analytics figures reconciled against the tables                       |

## Rehearsals

Each phase was also applied twice to a restored copy of production in a local container and
exercised in a transaction that ends with `RAISE EXCEPTION 'RESULT…'`, so nothing persisted. The
outcomes are recorded in `04-database-design.md`. Rehearsals are local evidence only; they do not
change the hosted project.

## Provider sandboxes

End-to-end checks with Stripe test mode and Razorpay test mode need test keys on a deployed
environment and are run manually from the runbook (`13-runbook.md`) before go-live.

### Stripe Test Clocks (optional, local)

```bash
STRIPE_TEST_CLOCKS=1 STRIPE_SECRET_KEY=sk_test_… npm test -- --run src/lib/billing/stripe-test-clock.integration.test.ts
STRIPE_TEST_CLOCKS=full STRIPE_SECRET_KEY=sk_test_… npm test -- --run src/lib/billing/stripe-test-clock.integration.test.ts
```

See `17-production-readiness-validation.md` for journey coverage and production blockers.
