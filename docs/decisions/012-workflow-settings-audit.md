# Decision 012: audit workflow settings transactionally

**Date:** 2026-11-26
**Status:** Accepted; additive migration is `READY-TO-APPLY` and has not been applied to hosted Supabase.

## Context

Several editable organisation defaults live in `company_workflow_settings`, separate from the Settings Centre's versioned `organisation_config` RPC. The table's row-level security and server functions enforce write access, but the row changes did not produce before/after `settings_change_log` evidence. This left settings such as **Require memo on manual journals** without the audit contract used by other organisation settings.

## Decision

Use an `AFTER INSERT OR UPDATE` trigger on `company_workflow_settings` to append one audit row for each changed setting in the same database transaction. RLS continues to authorize the original write; the trigger function is `SECURITY DEFINER`, has a fixed search path, and is not executable by client roles. Metadata-only writes do not create setting events.

The free-text fields `sales_default_notes`, `sales_payment_instructions`, and `purchases_default_notes` can contain information that should not be copied into an audit stream. Their changes are recorded with redacted markers, while a reviewed allowlist of non-sensitive typed values retains exact before/after JSON. Fields added in future default to redacted until reviewed. A failed audit insert aborts the setting change.

## Consequences

- No table shape or application write-path change is required. Existing `company.settings.edit` checks, RLS and field-level consumers remain authoritative.
- The reversible migration is `supabase/migrations/20261126180000_workflow_settings_audit.sql`; its drop-only rollback is `supabase/rollback/20261126180000_workflow_settings_audit.sql`.
- The isolated workflow PostgreSQL harness verifies insert/update audit evidence, redaction, no-op updates, client-role restrictions, tenant isolation and rollback on audit failure.
- Hosted application remains pending target-specific confirmed backup evidence in `docs/HANDOFF.md`; do not apply this migration to hosted Supabase without that evidence.
