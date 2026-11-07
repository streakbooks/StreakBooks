# App Store security & data protection matrix

**Status date:** 2026-11-07  
**Branch / worktree:** `feature/linkbooks-app-store` (`D:\MyApp\LinkBooks-app-store`)  
**Principle:** FAIL CLOSED — no real customer data until authorization, isolation and security controls are verified.

This document distinguishes **implemented**, **locally tested**, **failed**, and **pending** requirements. It does not claim production certification or live penetration-test completion.

## Controls matrix

| # | Requirement | Status | Evidence / location | Notes |
|---|-------------|--------|---------------------|-------|
| 1 | Strict data protection / least privilege / company isolation | **Implemented (foundation)** · **Locally unit-tested** · **Live RLS: pending** | Migrations `…161000`–`…163000`; OAuth state company mismatch alerts; isolation plan `05-SECURITY-ISOLATION-TEST-PLAN.md` | Live two-company execution **not done** |
| 2 | Secure integrations (OAuth 2.0/OIDC, PKCE, rotation, revocation) | **Partial + expanded** · **Unit-tested** | PKCE helpers + `create/consume_marketplace_oauth_state` RPCs (fail closed until gates); vault + compromise helpers | Production KMS vault **pending**. OAuth create RPC refuses unless e2e + review + real-data flags |
| 3 | Database security (RLS, server auth, no service-role exposure) | **Implemented (marketplace objects)** | Deny-all oauth_states/rate_events; anon revoked on privileged RPCs | Project-wide advisor triage still open |
| 4 | Anti-spam / anti-hacking | **Foundation expanded** · **Unit-tested** | Rate limits on catalogue/OAuth/consent; bot challenge + catalogue fingerprint helpers | Full CAPTCHA/WAF/IP auto-block **pending** |
| 5 | App approval before listing / activation | **Implemented** · **UI + unit-tested** | Security review queue; approve never enables real data | — |
| 6 | Customer privacy | **Implemented (UI + RPC)** | Privacy consent grant + revoke; Connections disconnect | Live OAuth auto-consent still waits on vaulted connectors |
| 7 | Security monitoring / emergency suspend | **Expanded** | Company suspend + **platform listing suspend** (`suspend_marketplace_app_listing`) in Trust UI | On-call paging **pending** |
| 8 | Webhook security | **Helpers implemented** · **Unit-tested** | Signature/replay/payload/idempotency | Live endpoints not mounted |
| 9 | Security testing | **Local unit tests** + **documented isolation plan** | `activation` / `as-sec-batch2` / `as-sec-batch3` tests | Staging isolation / pentest **not executed** |
| 10 | Existing advisor findings | **Reviewed · not fully remediated** | Prior docs | Marketplace deny-all tables intentional |

## Activation rule (FAIL CLOSED)

Live install / OAuth state create / real-data activation requires **all** of:

1. `implementation_status = e2e_verified`
2. `security_review_passed = true`
3. `real_customer_data_enabled = true` (never set by security-review approval or listing APIs alone)
4. Required permission (`appstore.install` / `manage_connections` as applicable)
5. App not suspended

## Migrations (authored, not applied)

| Migration | Purpose |
|-----------|---------|
| `20261107161000_marketplace_security_controls.sql` | Gates, rate limits, consents, alerts, install/revoke/suspend-for-company |
| `20261107162000_marketplace_oauth_approval_consent.sql` | OAuth state table, review queue, consent grant |
| `20261107163000_marketplace_oauth_suspend_catalogue_hardening.sql` | OAuth create/consume RPCs, platform listing suspend, rate-limited public catalogue |

## Local verification

| Check | Result |
|-------|--------|
| Unit tests (`vitest run src/lib/app-store`) | **43 passed** / 0 failed |
| ESLint (changed App Store paths) | Fixed on changed files |
| TypeScript (App Store paths) | Filtered checks; full-repo pre-existing failures remain |
| Supabase migrations applied | **Pending** |
| GitHub Actions / CI | **Not triggered** |
| Authenticated two-company live tests | **Not executed** (plan documented) |
| Penetration testing | **Not executed** |

## Explicit non-claims

- No production customer data access was enabled.
- No connector is E2E verified.
- Security review approval and OAuth helpers do **not** enable `real_customer_data_enabled`.
- Public catalogue responses force `realCustomerDataEnabled: false` for scrape surface honesty.
- Advisor warnings from prior reviews are not marked resolved by this work.
