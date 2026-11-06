# AD-02 — Plans, pricing and admin controls

## Intent

Let platform owners/finance staff change Advisors services and plans without a code deployment, using Save Draft → Preview → Publish → Version History → Restore, with audit reasons.

## Surfaces

- Authenticated `/advisors-admin` overview (public marketing page remains `/advisors`)
- `/advisors-admin/settings/services-pricing` admin UI
- Sidebar **Advisors** entry under Practice

## Persistence

Migration `20261106130000_advisors_catalogue_admin.sql`:

- Extends live catalogue tables with limits, session duration, annual price, enable/archive flags, chat welcome and exclusions
- `advisors_catalogue_versions` (one draft, one published)
- `advisors_catalogue_audit` (append-only)
- Platform RPCs gated by `private.require_platform('billing.view'|'billing.manage')`

Publishing updates the public catalogue for new visitors. It does **not** rewrite existing subscriptions, agreements or invoices.

## Local-only delivery note

AD-02 is developed and verified locally. No GitHub push/PR/CI is performed for this batch unless explicitly authorized later.
