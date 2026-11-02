# Handoff

Date: 2 November 2026. Branch: `feat/superadmin-control-centre`. Do not merge until the owner says "merge".

## Completed

- Phase 0 audit: `docs/superadmin/audit.md`.
- Phase 1 benchmark from pages fetched on 2 November 2026: `docs/superadmin/benchmark.md`.
- Decisions: `docs/decisions/001-extend-existing-billing.md` through `004-roadmap-priority.md`.
- Entitlement resolver, dependency checks, rollout buckets and removal rule. Unit tests cover source order, scope, deny-over-allow, expiry, dependencies and stable percentages.
- Feature catalogue registered in TypeScript and in migration `supabase/migrations/20261102120000_entitlement_price_book.sql`.
- Price-book quotes for included, flat, per-user, tiered, volume and usage prices. Integer minor units. Margin publish gate reuses `planMargin`.
- MRR = annual amount divided by 12 with integer truncation. ARR = MRR × 12. The remainder is documented (1000 minor units per year is MRR 83 and ARR 996).
- Overview copy distinguishes forbidden, empty, unseparated and ok revenue. Dates show the viewer time zone. Filter days are labelled UTC.
- Approvals screen: grant, revoke, add-on, trial, kill switch. Kill switch and global scope create a pending approval. The decider cannot be the requester. The screen is hidden until the migration adds `approvals.view`.
- Cursor rule: `.cursor/rules/linkbooks-superadmin.mdc`.
- Audit hash-chain trigger in the migration, using `md5`, not applied.

## Outstanding

- Apply the migration on a non-production database and re-run `tests/integration/platform-security.sql` plus a grant/revoke/kill-switch case.
- Customer plan builder route that calls `list_live_feature_prices` and `quoteFeature`.
- Enforce percentage, allowlist, region, trial and schedule rollouts inside `winning_entitlements`.
- Usage overage invoices, reconciliation, historical MRR snapshots.
- Batches C–H beyond the control plane that already shipped in October 2026. Do not add buttons for them until the RPC exists.
- Browser walkthrough of `/platform` with an MFA platform owner and a second user for approvals.

## BLOCKED

- Payment provider sync. Need a test-mode secret (`STRIPE_SECRET_KEY` or Razorpay test keys), a test customer and confirmation the key is not live. Do not put the key in the repo, the UI or logs.
- Applying the migration to project `ipxflpzfcqwtenodbxwc` while this programme forbids production changes.
- Email or mobile approval delivery. No verified mail transport was used. In-console decision is the path that exists.
- Single platform owner cannot self-approve a kill switch. A second platform user with `approvals.manage` is required. That is intentional.

## Next action

Say "Continue from docs/HANDOFF.md" to add the customer quote route and the database rollout enforcement, still on this branch, still without merging.
