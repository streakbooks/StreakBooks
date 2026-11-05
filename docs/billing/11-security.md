# Billing platform — security

## Phase 1 controls

| Threat | Control | Verified by |
|---|---|---|
| Client reads or edits billing rows directly | `billing` schema not exposed; no table grants to `anon`/`authenticated`; RLS on with no policies | SQL suite: `anon`/`authenticated` get `42501` on table access |
| Cross-tenant access | Access derived from `has_company_permission` (company) or account ownership (individual); client ids never trusted | SQL suite: owner of B refused on A's account; restored-production check: non-member refused |
| Employees seeing payment data | `billing.view`/`billing.payment_methods` only for owner and admin; others need an explicit grant | SQL suite: staff and ungranted accountant refused; granted accountant can view, not manage |
| MFA bypass through definer functions | Access helpers call `private.customer_access_ok()` (includes `mfa_requirement_met`) | SQL suite: MFA user refused at aal1, allowed at aal2 |
| Unknown or injected profile fields (e.g. card data) | Database allow-list plus zod `strict()` schema | SQL and unit tests |
| Lost updates | Optimistic concurrency token on profile updates (`40001`) | SQL suite |
| B2C seat circumvention | Trigger on `company_members` enforces the individual user limit | SQL suite |
| Audit tampering | Append-only trigger plus SHA-256 hash chain with verifier | SQL suite: tampered row detected |
| Silent rounding / float errors | bigint money module, ISO exponents, explicit rounding, exact decimal FX | Unit tests incl. > 2^53 amounts |

## Rules for later phases

- Payment and tax secrets stay server-side (`*.server.ts`, Edge Function secrets); `VITE_*`
  variables never hold secrets (`src/lib/env-safety.ts` enforces this).
- Card numbers and CVVs are never stored; checkout is provider-hosted.
- Logs never include provider payloads with personal data, card data or tax identifiers.
- Refunds, price publication and partner payouts require two-person platform approval.
- Webhooks are verified on the raw body, deduplicated by provider event id and processed
  asynchronously; frontend callbacks never activate a subscription.
