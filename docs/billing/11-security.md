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

## Rules for later phases

- Payment and tax secrets stay server-side (`*.server.ts`, Edge Function secrets); `VITE_*`
  variables never hold secrets (`src/lib/env-safety.ts` enforces this).
- Card numbers and CVVs are never stored; checkout is provider-hosted.
- Logs never include provider payloads with personal data, card data or tax identifiers.
- Refunds, price publication and partner payouts require two-person platform approval.
- Webhooks are verified on the raw body, deduplicated by provider event id and processed
  asynchronously; frontend callbacks never activate a subscription.
