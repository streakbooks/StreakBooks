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

## Completed since the first handoff

- Customer quote route `/pricing/builder`. It calls `list_live_feature_prices` and `quoteFeature` through `quoteCustomerPlan`. When add-on prices are not on the database yet, it prices the published base plan only and refuses to price selected features. It does not charge a card or write an entitlement. Browser check on the local app: Growth quoted at US$30 monthly and US$300 yearly; a selected white-label quantity was left unpriced.
- Database rollout enforcement in `supabase/migrations/20261102130000_rollout_enforcement.sql`. Active percentage, allowlist, internal, trial, region and scheduled rollouts can deny a plan or catalogue default. See `docs/decisions/005-rollout-windows.md`.
- Usage overage calculation in `usageOverage`. Units above the included quantity are priced at the stored unit rate. A missing rate stays unpriced. No invoice is created.
- Historical MRR movements in `supabase/migrations/20261102140000_mrr_movements.sql`. The first observation is a baseline. Later captures record new, expansion, contraction, and churn with the overview's active non-demo integer MRR. A currency change closes the old currency. Rows are append-only. Deleting a business that has a movement row is restricted. The migration is not applied.

## Outstanding

- Apply the entitlement, rollout, and MRR migrations on a non-production database and re-run `tests/integration/platform-security.sql` plus a grant, revoke, percentage rollout, kill-switch, and MRR-capture case.
- Usage overage invoices and reconciliation of stored MRR to the overview total.
- Attach a quoted add-on to a subscription. That stays blocked until a test-mode provider can create the line item. Do not grant the feature for free from the public quote page.
- Batches C–H beyond the control plane that already shipped in October 2026. Do not add buttons for them until the RPC exists.
- Browser walkthrough of `/platform` with an MFA platform owner and a second user for approvals.

## BLOCKED

- Payment provider sync. Need a test-mode secret (`STRIPE_SECRET_KEY` or Razorpay test keys), a test customer and confirmation the key is not live. Do not put the key in the repo, the UI or logs.
- Applying the migration to project `ipxflpzfcqwtenodbxwc` while this programme forbids production changes.
- Email or mobile approval delivery. No verified mail transport was used. In-console decision is the path that exists.
- Single platform owner cannot self-approve a kill switch. A second platform user with `approvals.manage` is required. That is intentional.

## Next action

Say "Continue from docs/HANDOFF.md" to reconcile the latest stored MRR movement per business with the overview total, still on this branch, still without merging or calling a payment provider.
