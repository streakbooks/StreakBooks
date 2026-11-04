# Settings Centre — guarded Organisation, Branding and document-number writes

## Changes
- **Localisation** uses `save_company_localisation_if_unchanged` with a baseline snapshot containing locale, date format, invoice footer and document colour.
- **Document branding** uses `save_company_branding_if_unchanged` with the five customer-facing branding values. First-time creation is handled safely without deleting existing branding.
- **Document numbering** uses `save_document_sequence_if_unchanged`. A row lock ensures newly allocated numbers cannot be overwritten by a stale settings form. The next number cannot be decreased.
- Each mutation checks `company.settings.edit`, runs with caller privileges and tenant RLS, writes an audit record, and returns an error instead of overwriting newer settings.
- Errors trigger a background refresh; the unsaved draft is preserved and the UI offers Reload latest.
- The read endpoint now reports branding/sequence/currency/rate query errors rather than treating them as an empty configuration.

## Rollout order
1. Pass full GitHub CI (TypeScript, full applicable ESLint, unit tests, isolated PostgreSQL integration/security, browser suite discovery and production build).
2. Apply `supabase/migrations/20261104164500_legacy_settings_cas.sql` to the verified LinkBooks Supabase project, then verify the functions are **SECURITY INVOKER** and anonymous execution is revoked. Reconcile the migration filename with the actual recorded version.
3. Deploy a build from `linkbusinessadvisory/LinkBooks` only to a project connected to that repository. Do not deploy these changes to the Vercel project still serving `rohitmehra86/LinkBooks`.
4. In authenticated staging, test two sessions editing the same section, document-number allocation while the editor is open, keyboard/mobile save/discard controls, and audit logs. No production deployment is claimed until verified.

## Compatibility / limitations
- These guarded writes replace only the legacy form entry points, not every possible administrative database API. Other direct edits are covered by the row-level read locks where they target the same rows; any alternate public paths must be reviewed separately.
- The Company identity + financial defaults editor still uses `updateCompany` and requires its own database compare-and-save work.
- The migration is additive: it creates functions and grants, without changing existing accounting records or column definitions.
- Authenticated browser tests, performance benchmarking, comprehensive assistive-technology testing and Vercel production verification remain release gates.
