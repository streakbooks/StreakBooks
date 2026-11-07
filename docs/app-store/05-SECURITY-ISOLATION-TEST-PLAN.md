# App Store two-company isolation test plan

**Status:** documented fixture plan — **not executed** against live Supabase in this worktree.  
**Principle:** FAIL CLOSED. Do not enable `real_customer_data_enabled` to run these tests.

## Prerequisites

1. Staging project with migrations through `20261107163000_marketplace_oauth_approval_consent` / catalogue hardening applied.
2. Two synthetic companies (`Company A`, `Company B`) with distinct owners — no real customer data.
3. Users: `owner_a`, `owner_b`, `staff_a` (no `appstore.install`), outsider (authenticated non-member).

## Negative cases (must deny)

| # | Action | Actor | Expect |
|---|--------|-------|--------|
| 1 | `list_company_marketplace_apps(B)` | owner_a | `42501` / not a member |
| 2 | `list_company_integration_connections(B)` | owner_a | denied |
| 3 | `list_company_app_consents(B)` | owner_a | denied |
| 4 | `revoke_marketplace_app_access(B, …)` | owner_a | denied + optional security alert on A only if membership check order allows insert — prefer deny before write |
| 5 | `create_marketplace_oauth_state(B, …)` | owner_a | denied / cross_tenant alert |
| 6 | `consume_marketplace_oauth_state` with A's state and B company | owner_a | mismatch / critical alert |
| 7 | `grant_app_connection_consent` with B connection id under A | owner_a | connection not found |
| 8 | `request_marketplace_app_install` without `appstore.request_install` / `install` | staff without perms | permission_denied alert |
| 9 | Direct `SELECT` on `marketplace_oauth_states` / `marketplace_rate_events` as authenticated | any member | zero rows (deny-all) |
| 10 | Anon `request_marketplace_app_install` | anon | no EXECUTE |

## Positive cases (must allow only in-scope)

| # | Action | Actor | Expect |
|---|--------|-------|--------|
| 1 | `list_company_marketplace_apps(A)` | owner_a | catalogue JSON |
| 2 | `list_company_app_consents(A)` | owner_a / manage_connections | array |
| 3 | `list_marketplace_security_reviews(A)` | manage_certification on A | array (may be empty) |
| 4 | Public `list_public_marketplace_catalogue` under rate limit | anon | catalogue; burst → rate limit error |

## Token compromise drill (staging only)

1. Never use production credentials.
2. With ephemeral/test vault only: store → rotate via compromise helper → revoke → confirm `credential_ref` cleared on disconnect RPC.
3. Confirm UI never returns access/refresh tokens.

## Evidence to capture

- SQLSTATE / error messages
- `marketplace_security_alerts` rows for cross-tenant attempts
- Confirmation `real_customer_data_enabled` remains false for all seed apps

## Explicit non-claims

Passing this plan on staging is not a penetration test, SOC2 evidence package, or production go-live approval.
