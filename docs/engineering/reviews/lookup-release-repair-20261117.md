# Shared lookup release repair

The enforced lookup architecture gate found 147 legacy data-driven selectors (38 native and 109 Radix) after the new POS fields were migrated separately. Adapt these controls to the existing `RecordLookupSelect`, preserving original option IDs, disabled state, grouping, values, accessibility labels and handlers. Native handlers receive the chosen value instead of reading `event.target.value`; all other selection effects remain unchanged. Queries and financial posting code are unchanged. No exception marker or disabled gate hides the findings.

Validation: lookup architecture reports 374 shared declarations and zero violations; 89 focused lookup/text/messaging/CRM tests passed across 25 files. Whole-repository lint, full unit/type/build checks and existing browser fixtures must be rerun on the final integrated revision. No claim that these local tests authenticate or verify all 147 live workflows is made.

Dependent on the isolated lint and regression repair branches. Main/PR #227 overlap remains reviewable; no branch history is rewritten. This is not a production deployment or full POS completion.

Windows review: protect local edits, fetch and inspect `origin/fix/lookup-release-gate-20261117`; run `npm.cmd run check:lookups`, the lookup Vitest suite, and relevant Playwright UI fixtures. Manually review keyboard search, clear/filter behavior, selected labels, disabled rows, empty data, validation labels and mobile popup sizing across account/contact/product/tax/HR/firm selectors. Use a dedicated test company for any saved operation. Remaining authenticated staging/full-schema and release gates are documented on the POS integration PR.
