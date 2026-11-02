# Superadmin control centre audit

Date: 2 November 2026. Method: repository inspection of routes, server functions, billing migrations and the October 2026 control-plane handoff. No production database was queried and no penetration test was run.

## Source of truth

| Capability | Authoritative object | Do not duplicate |
| --- | --- | --- |
| Plans and list prices | `billing_plans`, `plan_versions`, `plan_prices` | A second plan table |
| Feature catalogue | `billing_features` plus `src/lib/platform/feature-registry.ts` | `organisation_features` (settings toggles only) |
| Entitlements | `get_entitlements` / `winning_entitlements` | Frontend permission checks |
| Subscription state | `company_subscriptions` | Provider dashboard as the ledger |
| Provider events | `billing_events` | A successful button click |
| Platform permission | `platform_roles`, `platform_custom_roles`, `private.platform_can` | Tenant `company_members.role` |
| Admin audit | `platform_audit` | Editable notes |
| Settings dimensions | `src/lib/settings/feature-catalog.ts` | Commercial price book |
| Margin floors | `src/lib/billing/margin.ts` | A second margin helper |

## Routes

Entry: `/platform` (`src/routes/_authenticated/platform.tsx`). Sections come from `src/lib/platform/catalog.ts` and are filtered by `resource.view`. MFA AAL2 and a live session are required by `private.platform_context`.

| Section | Status | Evidence |
| --- | --- | --- |
| Overview | PARTIAL | Counts come from `private.platform_overview`. Revenue previously used one empty array for both “no rows” and “no billing permission”. |
| Businesses, firms, users, roles | PARTIAL | `platform_list` / `platform_mutate` in `20261030144257_superadmin_control_plane.sql`. Server-side page size is 25. |
| Subscriptions, billing | PARTIAL | Reads `company_subscriptions` and `billing_events`. Price draft/publish already exists. Full lifecycle UI is not on this screen. |
| Accounting configuration | PARTIAL | `platform_records` kind `accounting`. Does not rewrite existing organisations. |
| Feature management | PARTIAL | Module write guard plus plan limits. Per-customer grant/revoke is added in `20261102120000_entitlement_price_book.sql` and is not applied to the connected database in this run. |
| Integrations, API | PARTIAL | Credential presence only. Secrets are not returned. Connectivity is not verified. |
| Monitoring | PARTIAL | `platform_health` measures database reachability and bytes. No queue, latency or backup feed. |
| Audit | PARTIAL | Append-only `platform_audit`. Hash chain is in the new migration and is not applied here. |
| Support | PARTIAL | Tickets plus one-hour grants. Journal header reads are capped. No ledger browsing. |
| Notifications, settings | PARTIAL | Announcements and maintenance flag. Maintenance blocks customer writes and leaves reads. |
| Approvals | IMPLEMENTED in repo, BLOCKED on database apply | `src/components/platform/PlatformApprovals.tsx`. Hidden until `approvals.view` exists. |

Hidden or unfinished product areas (status page, BI warehouse, SMS, e-signature, synthetic checks, mobile admin PWA) are MISSING and intentionally not given buttons. See `docs/decisions/002-commodity-operations-tools.md`.

## Architecture notes

- Stack: React, TanStack Start, Supabase Auth, Postgres RLS. Platform RPCs are `SECURITY INVOKER` wrappers around `private` definer helpers.
- Billing providers in code: Stripe and Razorpay. This run did not call them. Test mode is required before any sync.
- `is_demo` excludes demo businesses from overview counts. Demo companies are complimentary in the subscription migration. Posting maths does not branch on `is_demo` for ledger rules; billing allowance returns early for demo companies.
- Platform staff do not receive a customer-ledger policy from the control-plane migrations. Support reads need a separate grant.

## Defect register

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| SA-001 | High | Revenue card used one sentence for an empty result and a missing `billing.view` permission. | Fixed in the UI for both old and new payloads. `revenueState` is added in the unapplied migration. |
| SA-002 | Medium | Snapshot time used `toLocaleString()` with no zone label. Date inputs are UTC calendar days and looked like local dates. | Fixed in `PlatformOverview` via `formatConsoleInstant` and `formatUtcDay`. |
| SA-003 | High | MRR used `round(numeric, 2)` on integer minor units, which is not an integer division by 12. | Fixed in the unapplied overview function. Integer formula is tested in `revenue-metrics.ts`. Live RPC still uses the old formula until the migration is applied. |
| SA-004 | High | `get_entitlements` only reflected the plan version. A grant, revoke, add-on, trial, suspension or kill switch could not change one business. | Resolver and tables are in the repo. Not applied to the database. |
| SA-005 | Medium | Feature dependencies could be hardcoded per screen. | Server table `feature_dependencies` plus `FEATURE_DEPENDENCIES`. UI modules must not redeclare them. |
| SA-006 | Medium | Audit rows were append-only but not hash-chained. A superuser can still alter them. | `md5` chain trigger is in the migration. Not applied. Not a WORM store. |
| SA-007 | High | No second-person gate for a global kill switch. | `platform_set_entitlement` queues kill switches and global changes. Self-approval is rejected. Not applied. |
| SA-008 | Low | Integrations and API screens do not prove provider health. | Still true. Do not show them as connected. |
| SA-009 | Medium | Historical MRR, cohorts, LTV and fees are not stored. Current snapshot cannot reconstruct them. | MRR movements and a start-month count are in the repo. Existing subscriptions are not backfilled, so they stay out of a month. LTV and fees are still not stored. Do not invent those charts. |
| SA-010 | Low | Browser acceptance of `/platform` needs an MFA platform session. | One signed-in session opened overview, businesses, subscriptions, features and integrations. Approvals was absent. Billing was not opened. A second approver was not used. |

## Performance

No p95 measurement was taken. Targets in the programme (entitlement check under 50 ms, quote under 300 ms, list under 500 ms at 10,000 businesses, dashboard under 2 s) are NOT VERIFIED.
