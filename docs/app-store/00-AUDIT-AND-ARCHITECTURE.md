# LinkBooks App Store — Audit & Architecture (AS-01)

**Branch:** `feature/linkbooks-app-store`  
**Worktree:** `D:\MyApp\LinkBooks-app-store`  
**Date:** 2026-11-07

## Product direction (confirmed)

LinkBooks is an **open integration platform** with:

1. **Customer App Store** — discover, request/install, manage connections.
2. **Secure public API + developer portal** — third parties (Hubdoc, Link My Books, others) integrate subject to API availability, cooperation and technical approvals.
3. **Native connectors first** — Amazon Seller Central, Shopify, Stripe (merchant), then WooCommerce / PayPal / Square.
4. **Honesty rule** — no connector is marked complete (`e2e_verified`) until real end-to-end synchronization is verified.

## Gap audit summary

| Area | Status before AS-01 |
|---|---|
| App Store / marketplace UI | Missing |
| Generic connector framework | Missing |
| Shopify / Amazon / Woo / PayPal / Square clients | Missing |
| Hubdoc / Link My Books partner API | Missing |
| Public developer OAuth for partners | Missing |
| Settings → Integrations & API | Honest health catalogue only (email / FX / bank / gateway) |
| Stripe / Razorpay in repo | LinkBooks SaaS billing + portal checkout only — **not** merchant App Store connectors |
| `organisation_secrets` | Digest-only placeholders; not a recoverable vault |
| `bank_feed_connections` | Status stub; no live aggregator |

## Architecture (Batch 1)

- **Catalogue:** `app_categories`, `marketplace_apps`, `marketplace_app_categories`, `app_installations`
- **Developer foundation:** `developer_publishers`, `developer_applications`, `developer_oauth_clients` (hash-only secrets), `public_api_scopes`
- **TS connector registry:** `src/lib/app-store/adapters/*` — Shopify / Amazon / Stripe scaffolds with `installEligible: false`
- **Permissions:** `appstore.*` and `developer.*`
- **Nav:** top-level **App Store** (`/app-store`) and **Developer** (`/developer`)

## Explicit non-claims

- No E2E sync verified for any provider.
- No production Install for native connectors.
- Partner listings do not imply a working Hubdoc or Link My Books connection.
- Marketplace billing is separate from LinkBooks SaaS billing (not activated in AS-01).

## Xero-parity addendum

See `01-XERO-PARITY-ADDENDUM.md` and `02-GAP-ANALYSIS-ADDENDUM.md`.

Integrated foundations (not parity claims):

- Universal App Launcher (header)
- Accountant Advisory workspace + `firm_app_recommendations`
- Certification / trust fields, partner tiers, usage/analytics/version tables
- Quality-check and security-incident tables

**Xero-level feature parity is not declared.**

## Next batches

- **AS-02 / XP-03** Installation wizard, OAuth vault, seamless onboarding  
- **AS-03 / XP-08** Sync engine + quality gates when credentials allow  
- **AS-04** Accounting mapping & reconciliation  
- **AS-05 / XP-05–07** Developer publishing, partner program, usage & analytics  
- **AS-06 / XP-04/10** Certification ops, trust & safety workflows, a11y, production readiness  
