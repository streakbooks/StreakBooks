# Billing platform — security

## Phase 1 controls

| Threat                                              | Control                                                                                                            | Verified by                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Client reads or edits billing rows directly         | `billing` schema not exposed; no table grants to `anon`/`authenticated`; RLS on with no policies                   | SQL suite: `anon`/`authenticated` get `42501` on table access                               |
| Cross-tenant access                                 | Access derived from `has_company_permission` (company) or account ownership (individual); client ids never trusted | SQL suite: owner of B refused on A's account; restored-production check: non-member refused |
| Employees seeing payment data                       | `billing.view`/`billing.payment_methods` only for owner and admin; others need an explicit grant                   | SQL suite: staff and ungranted accountant refused; granted accountant can view, not manage  |
| MFA bypass through definer functions                | Access helpers call `private.customer_access_ok()` (includes `mfa_requirement_met`)                                | SQL suite: MFA user refused at aal1, allowed at aal2                                        |
| Unknown or injected profile fields (e.g. card data) | Database allow-list plus zod `strict()` schema                                                                     | SQL and unit tests                                                                          |
| Lost updates                                        | Optimistic concurrency token on profile updates (`40001`)                                                          | SQL suite                                                                                   |
| B2C seat circumvention                              | Trigger on `company_members` enforces the individual user limit                                                    | SQL suite                                                                                   |
| Audit tampering                                     | Append-only trigger plus SHA-256 hash chain with verifier                                                          | SQL suite: tampered row detected                                                            |
| Silent rounding / float errors                      | bigint money module, ISO exponents, explicit rounding, exact decimal FX                                            | Unit tests incl. > 2^53 amounts                                                             |

## Phase 2 controls

| Threat                                            | Control                                                                                                                                                                      | Verified by                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Repeat free trials                                | One trial per person and per billing account (`billing.trial_grants`, rules configurable by platform staff); trial records and the eligibility check are not client-callable | SQL suite: second organisation and backfilled trial user refused; clients get `42501` |
| Selling a plan at a placeholder price             | Database guards on `billing_checkouts` and paid plan changes (`23514`); server functions refuse quotes and checkout; public catalogue hides prices checkout cannot charge    | SQL suite and restored-production check                                               |
| Unauthorised plan or trial changes                | Admin functions require `private.require_platform('billing.manage')` (aal2 platform session), validate input, write `platform_audit`; not executable by `anon`               | SQL suite: customer, aal1 staff and anonymous callers refused                         |
| Changing what existing customers bought           | Limit changes create a draft/review version copied from the published one; finance staff drafts need owner approval                                                          | SQL suite: published limits unchanged                                                 |
| Locking a founder out of a read-only organisation | Seat check exempts only the creator becoming the first active owner                                                                                                          | SQL suite: further members refused                                                    |

## Phase 3 controls

| Threat                                    | Control                                                                                                             | Verified by                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| One person changing live prices           | Price-book versions are published by a platform owner other than the drafter; finance drafts go to review           | SQL suite and production-copy rehearsal |
| Changing a price customers already bought | Published/archived `plan_prices` rows cannot be updated or deleted (`55000`)                                        | SQL suite                               |
| Rate tampering                            | Exchange rates are append-only, recorded with actor, source and times; every pricing change writes `platform_audit` | SQL suite                               |
| Float or rounding drift                   | Exact `numeric`/`bigint` conversion, single rounding, ISO minor units; identical vectors in SQL and unit tests      | SQL suite and unit tests                |
| Client-chosen country changing a charge   | Country selection on the pricing page is display-only; checkout (phase 5) uses the verified billing address         | Design; enforced in phase 5             |
| Reading or writing pricing internals      | `billing` tables not exposed; admin functions need an aal2 platform session and are not executable by `anon`        | SQL suite                               |

## Phase 4 controls

| Threat                                       | Control                                                                                              | Verified by                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Cancelling someone else's subscription       | `billing.manage` on that organisation, re-checked in the database                                    | SQL suite: staff and outsiders refused |
| Cancelling on terms the customer did not see | Current policy id must be confirmed; changed policy refused (`40001`); version and acceptance stored | SQL suite and rehearsal                |
| A provider charging after cancellation       | Provider subscriptions are cancelled through the provider until phase 5                              | SQL suite                              |
| Rewriting history or legal text              | Events, acceptances and approved/published documents are immutable; requests cannot be edited        | SQL suite                              |
| One person publishing legal text             | Approval by a platform owner other than the author; finance staff cannot approve                     | SQL suite and rehearsal                |
| Storing client addresses                     | Only an HMAC with a server secret, or nothing                                                        | Code review                            |
| Pause misuse                                 | Platform staff with an aal2 session only; audited in both audit trails                               | SQL suite                              |

## Phase 5 controls

| Threat                                           | Control                                                                                 | Verified by                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| Forged webhooks                                  | Signature verified on the raw body before anything is stored                            | Existing signature tests                    |
| Replayed or duplicated deliveries                | Unique provider event id; activation skipped once the checkout is complete              | SQL suite and rehearsal                     |
| Out-of-order events undoing newer state          | Provider state time; older events skipped                                               | SQL suite                                   |
| Buying at a tampered or wrong-country price      | Database guard ties checkouts to the published snapshot for an open country             | SQL suite (caught a real USD-for-India gap) |
| Customers granting themselves access             | Applier, provider confirmations, price mappings and webhook store are service-role only | SQL suite: `42501` for clients              |
| Charging after cancellation                      | Provider cancelled first; nothing scheduled until the provider confirms                 | SQL suite and unit tests                    |
| Live charges in testing                          | Live keys refused without the production flag; mode stored everywhere                   | Unit tests                                  |
| Opening a country without tax/provider readiness | Platform owner only, audited                                                            | SQL suite                                   |

## Phase 6 controls

| Threat                                           | Control                                                                                                    | Verified by             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| One person setting tax, sellers or refunds       | Second platform owner approves rules, seller activation and refunds; author/requester refused              | SQL suite and rehearsal |
| Altering issued documents                        | Invoices, lines, credit notes and payments immutable; PDF reference set once                               | SQL suite               |
| Gaps or duplicates in numbering                  | Locked counter, unique numbers, series cannot be rewound                                                   | SQL suite               |
| Over-refunding                                   | Refund limited to unrefunded amount including open requests                                                | SQL suite               |
| Leaking invoices across tenants                  | `billing.view` on the invoice's organisation (or platform billing view); PDFs private with 60-second links | SQL suite               |
| Clients recording payments or completing refunds | Service-role only functions                                                                                | SQL suite (`42501`)     |
| Guessing tax                                     | No seeded rates; missing configuration leaves payments pending with a reason                               | SQL suite and rehearsal |

## Phase 7 controls

| Threat                                         | Control                                                                 | Verified by             |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ----------------------- |
| Discounts beyond policy                        | Existing 50% cap; amount capped at the price; computed server-side      | SQL suite               |
| Exceeding use limits under concurrency         | Code row locked on reservation; reservations count for 24 hours         | SQL suite               |
| Using someone else's checkout                  | Codes attach only to the caller's own open checkout with billing.manage | SQL suite               |
| Changing a discount customers already received | Terms locked after reservation, redemption or provider mapping          | SQL suite and rehearsal |
| Clients redeeming codes                        | Service-role only redemption                                            | SQL suite               |

## Rules for later phases

- Payment and tax secrets stay server-side (`*.server.ts`, Edge Function secrets); `VITE_*`
  variables never hold secrets (`src/lib/env-safety.ts` enforces this).
- Card numbers and CVVs are never stored; checkout is provider-hosted.
- Logs never include provider payloads with personal data, card data or tax identifiers.
- Refunds, price publication and partner payouts require two-person platform approval.
- Webhooks are verified on the raw body, deduplicated by provider event id and processed
  asynchronously; frontend callbacks never activate a subscription.
