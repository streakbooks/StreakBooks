# Database and migration plan

Batch 1 adds no schema, grants or migrations. Existing `products` has company/active indexes and company-membership SELECT RLS (`20261019240000_products_search_settings.sql`); server adds Sales permission and company predicates. Review Data API table privileges separately from RLS when adding tables. No service-role client is used.

Proposed minimal phase-1 entities, pending location audit:

- register references company, existing location and configured cash account; unique company/register code.
- session references register with composite company ownership, opening cashier/time/float; partial unique index allows one open session per register; row locking serializes close and sale writes.
- immutable cash movements carry session, actor, reason, amount, GL origin and unique operation key.
- immutable audit events capture actor/company/location/entity/event and redacted before/after metadata.

Later sale/line/payment tables require composite tenant FKs, check constraints on monetary/state values, source uniqueness and immutable posting links. No cascading delete of posted sales. Refund lines reference original lines with row-locked cumulative quantity/refund limits. Accounts must belong to company and match mapping types. Server timestamps govern business day through company timezone. Closed sessions cannot receive movements.

Currency amounts: integer minor units; currency precision comes from existing money helpers. Snapshot currency, tax version, pricing basis, dimensions and line rates. Never silently coerce unsafe JavaScript numbers. Index company/session/status/time access paths and FK columns based on real query plans. Set retention for statutory financial records per jurisdiction; do not purge journals for a contact deletion request.

Create migrations with the installed Supabase CLI after command discovery. Validate in an isolated local database, run security advisors and migration order checks. Do not alter old migrations or apply a live migration as part of development.
