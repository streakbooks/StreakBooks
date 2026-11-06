# Tax workspace — UX and functional batch 01 (2026-11-06)

## Scope
- New live Overview landing tab at /tax with read-only counts from the existing
  tax rates, codes and return APIs. Includes registration, return, rates, codes,
  GL mappings, packs and Tax Summary shortcuts.
- Setup-review messages based on available configuration and migration state.
  They are hints only: not a declaration of legal or filing readiness.
- Search and status filtering for rates and codes, including empty-result views.
- Registration and GL mappings show unsaved changes and offer discard/reset.
  Save is disabled when unchanged or the user lacks tax.settings permission.
- Rate/code creation, edits, activation and deactivation now respect tax.settings
  in the UI (server permission checks remain authoritative).
- Draft save, filing record, delete and settlement actions in Returns are
  disabled for users without tax.settings.
- Missing account lookup data blocks GL mapping saves rather than allowing
  accidental clears.

## Accounting and compliance boundaries
- No posting, tax calculation, tax return formula, migration or RLS changes.
- Previously posted documents remain unchanged.
- A status of "filed" means recorded in LinkBooks, never electronically filed.
- Country pack configuration has not been independently verified against
  statutory sources; no statutory filing certification is claimed.

## Local verification required (CI intentionally not invoked)
From D:\MyApp\LinkBooks after checking out this PR branch:

    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd test -- src/lib/tax/tax-workspace.test.ts src/lib/tax/tax-settings-patch.test.ts
    npm.cmd run build
    npm.cmd run dev

Manual:
1. Open /tax with a tax-settings admin and with a read-only user.
2. Check Overview counts against Rates, Codes and Returns; exercise every shortcut.
3. Search/filter rates by name, percentage and each effective-date status.
4. Search/filter codes by code, name, rate and active/inactive state.
5. Change registration and GL mappings, confirm save/discard and revisit tabs.
6. Simulate account API failure, confirm mappings cannot be saved.
7. As a read-only user verify mutations are disabled; verify backend RLS separately.
8. Confirm draft return calculations, CSV, marking filed and settlement still work
   as before with an authorised user.
9. Inspect narrow/mobile layouts and keyboard navigation.

## Follow-up batches
- Shared tax form validation and edit conflict/unsaved navigation protection.
- Rate-change historical reference immutability and effective-date/version controls.
- Saved returns reconciliation to posted tax account balances and source drill-down.
- Country-specific pack verification and audited statutory-form templates.
- Provider-gated e-filing only after formal country-by-country compliance review.
