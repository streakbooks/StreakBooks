# Settings Centre — multicurrency database safety

## Accounting invariant

An organisation must not explicitly disable the multicurrency feature while it
has enabled additional transaction currencies in `company_currencies`. Once the
feature is explicitly disabled, users must enable it again before adding or
editing additional currencies. An absent feature row retains existing legacy
behaviour. The base currency is implicit and is never removed.

## Implementation

Migration:
`supabase/migrations/20261104181716_multicurrency_feature_disable_guard.sql`

- `guard_multicurrency_feature_disable` rejects `false` feature writes when
  that tenant has configured additional currencies.
- `guard_currency_add_when_feature_disabled` rejects new/edit currency rows
  while the feature is explicitly disabled.
- Both use advisory transaction lock `(20261104, hashtext(company_id::text))`,
  matching `replace_company_currencies_atomic` and serialising currency and
  feature changes across the supported database writes.
- Existing posted journals, invoices, bills and foreign exchange history are
  untouched. Trigger functions use invoker privileges with restricted EXECUTE.
- Other feature keys are unaffected by the disable trigger.

## Verification before production rollout

1. Confirm the repository CI workflow runs the isolated PostgreSQL script
   `npm.cmd run test:workflows:postgres` and passes the new migration/fixture.
2. Confirm TypeScript, ESLint, unit tests and production build pass on the
   exact PR head (not a previous commit).
3. Apply the reviewed migration to the correct LinkBooks Supabase project only
   after the change is approved. Inspect `pg_trigger` for the two enabled
   triggers and `pg_proc` for invoker security and anonymous EXECUTE revocation.
4. In authenticated staging, use two organisations: test direct RPC refusal,
   disabling with a configured additional currency, clearing it and disabling,
   rejection of adding another currency while disabled, then re-enabling.
5. Verify that no transaction history, general ledger balances or currency
   settings are silently removed on rejected saves.
6. Ensure production Vercel is connected to
   `linkbusinessadvisory/LinkBooks` before deploying the matching frontend.
   Do not deploy to the existing project while it references another repository.

## Important limits

This guard validates *configured currency selections*, not actual open foreign
currency document balances across every module. Those states need their own
review before the product can claim full multicurrency-closeout enforcement.
SQL regression fixtures are synthetic and are not a replacement for
authenticated staging/browser acceptance. No user data migration is required.
