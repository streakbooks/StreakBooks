# Settings Centre — atomic enabled-currency update

## Accounting/data integrity issue fixed

Before this change, the server endpoint deleted all enabled currency rows in one PostgREST request and inserted the replacement rows in another. A failed insert could leave the organisation without its previous allowed transaction currencies. Multiple editors could also silently overwrite each other's selections.

This change adds `replace_company_currencies_atomic(uuid,text[],text[])` to PostgreSQL. It is an authenticated **SECURITY INVOKER** RPC, so the caller's existing tenant RLS and `company.settings.edit` permissions remain in force. It:

- Accepts a desired list and the baseline list originally shown to the editor.
- Acquires a transaction-scoped, organisation-specific advisory lock.
- Rejects stale baseline values and malformed codes.
- Deletes removed rows and inserts new ones **within one transaction**.
- Records before/after values in the existing audit log within that same transaction.
- Rolls all changes back if a write or audit fails; preserves the base currency implicitly.
- Returns the normalised saved selection.

The frontend passes the original baseline to the RPC and no longer has an unsafe delete-and-reinsert fallback. The server validates the user selection against the application's supported currency list.

## Rollout order — required

1. Run the full GitHub quality gates (typecheck, ESLint, unit tests, isolated PostgreSQL workflow/security tests, navigation checks and production build).
2. Apply `supabase/migrations/20261104115821_settings_currencies_atomic.sql` **only to the verified LinkBooks Supabase project** using migration tooling. Confirm the function exists and anonymous execution is revoked.
3. Deploy the matching application build from **linkbusinessadvisory/LinkBooks** (not the old rohitmehra86 repository). If the RPC is absent, the new save path will error rather than silently use the unsafe implementation.
4. In authenticated staging, save and reload currencies, test simultaneous edits, verify a warning on stale edits and check audit events. Confirm other organisations and existing posted documents are unchanged.
5. Verify production source SHA, database migration status and an authenticated end-to-end flow before marking deployment complete.

## CI coverage

The existing workflow PostgreSQL container now executes `settings-currencies-atomic.sql` against a two-tenant fixture. It verifies success, stale-edit rejection, forged/cross-tenant access denial, invalid codes, rollback on simulated insert failure, rollback on audit failure and anonymous execution denial. These tests never touch a live database.

## Remaining concerns

- The old application remains in use anywhere the authoritative repository is not deployed.
- Other legacy settings (company identity, branding and document sequences) still require database-enforced optimistic versions; browser-side baseline checks are not sufficient for a race.
- Real authenticated browser, mobile, keyboard accessibility and staging/production provider checks are separate release gates.
