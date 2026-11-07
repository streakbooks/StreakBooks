# App Store security & data protection matrix

**Status date:** 2026-11-07  
**Workspace:** `D:\MyApp\LinkBooks` on `main`  
**Principle:** FAIL CLOSED — no real customer data until authorization, isolation and security controls are verified.

This document distinguishes **implemented**, **locally tested**, **failed**, and **pending** requirements. It does not claim production certification or live penetration-test completion.

## Controls matrix (10 mandatory)

| # | Requirement | Implemented | Locally tested | Pending / failed |
|---|-------------|-------------|----------------|------------------|
| 1 | Strict data protection / least privilege / company isolation | Yes — RLS on marketplace objects; `assertSameCompany` / `filterToCompany`; OAuth company mismatch | Yes — unit (`activation`, `as-sec-batch2`, `as-sec-batch3`, `as-sec-batch4`) | **Live two-company RLS execution pending** (plan in `05`) |
| 2 | Secure integrations (OAuth 2.0/OIDC, PKCE, rotation, revocation) | Yes — PKCE + OAuth state RPCs fail-closed; vault contracts; compromise rotate/revoke | Yes — unit | **Production KMS vault pending**; no live provider OAuth |
| 3 | Database security (RLS, server auth, no service-role exposure) | Yes — deny-all oauth_states/rate_events; server fns use user JWT; client guards | Partial unit + migration authoring | Project-wide advisor triage still open |
| 4 | Anti-spam / anti-hacking | Yes — Postgres rate helpers; bot challenge; in-process marketplace HTTP rate limit + challenge endpoint | Yes — unit incl. HTTP burst 429 | Full CAPTCHA / WAF / IP auto-block **pending** |
| 5 | App approval before listing / activation | Yes — security review submit/decide; approve never enables real data | Yes — unit + Trust/Admin UI | — |
| 6 | Customer privacy | Yes — consent grant/revoke RPCs + Privacy UI | Partial (RPC/UI); live OAuth consent waits on vault | Live OAuth auto-consent **pending** |
| 7 | Security monitoring / emergency suspend | Yes — company + listing suspend; abuse alert drafts (redact tokens) | Yes — unit for alert redaction / severity | On-call paging **pending**; alert draft persistence optional |
| 8 | Webhook security | Yes — signature/replay/payload/idempotency helpers | Yes — unit | Live webhook ingress **not mounted** for partners |
| 9 | Security testing | Local unit suites + isolation plan | **Local unit: pass** | Staging isolation / pentest **not executed** |
| 10 | Existing advisor findings | Marketplace deny-all intentional; reviewed | N/A | Broader advisor remediations **not claimed resolved** |

## Activation rule (FAIL CLOSED)

Live install / OAuth state create / real-data activation requires **all** of:

1. `implementation_status = e2e_verified`
2. `security_review_passed = true`
3. `real_customer_data_enabled = true` (never set by security-review approval or listing APIs alone — **this work never flips it true**)
4. Required permission (`appstore.install` / `manage_connections` as applicable)
5. App not suspended

Marketplace public HTTP (`/api/marketplace/v1`) additionally requires OAuth vault configured + security review + active consent; otherwise returns `security_locked` (503). Billing SaaS API remains at `/api/v1`.

## Migrations (applied on linked production)

| Migration | Purpose |
|-----------|---------|
| `20261107161000_marketplace_security_controls.sql` | Gates, rate limits, consents, alerts, install/revoke/suspend-for-company |
| `20261107162000_marketplace_oauth_approval_consent.sql` | OAuth state table, review queue, consent grant |
| `20261107163000_marketplace_oauth_suspend_catalogue_hardening.sql` | OAuth create/consume RPCs, platform listing suspend, rate-limited public catalogue |

Evidence: `docs/app-store/AS-MIGRATIONS-APPLIED-20261107.md`. No new migration required for this security batch.

## Local verification

| Check | Result |
|-------|--------|
| Unit tests (`vitest run src/lib/app-store`) | **66 passed** / 0 failed (2026-11-07) |
| TypeScript (App Store paths) | No App Store path errors in last filtered `tsc` (repo has unrelated pre-existing failures) |
| Supabase new migrations | **Not required** / not applied this batch |
| GitHub Actions / CI | **Not triggered** |
| Authenticated two-company live tests | **Not executed** |
| Penetration testing | **Not executed** |

## Explicit non-claims

- No production customer data access was enabled (`real_customer_data_enabled` remains false).
- No connector is E2E verified; Install/Connected stay blocked.
- Security review approval and OAuth helpers do **not** enable `real_customer_data_enabled`.
- Public catalogue / HTTP responses stay fail-closed.
- Not production-ready for real customer marketplace use while vault, live isolation and pentest remain pending.

