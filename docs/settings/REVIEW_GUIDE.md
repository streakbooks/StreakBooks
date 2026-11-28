# Settings module review guide

**Status:** implementation in progress; review findings reflect the local feature branch, not a production deployment.

## What to review

1. Open **Settings** from the left navigation. The existing app shell remains in place.
2. Browse the grouped sections and use **Search settings** to find categories and typed settings such as “late-fee grace period”.
3. Open a category and check the `Settings / Category` breadcrumb. Detail pages use `Settings / Category / Page`.
4. Open a module settings link (for example Sales defaults) and use **Back to Sales** to return to that workspace.
5. Refresh a nested page and use browser Back/Forward. Legacy links such as `/sales/settings` and `/settings?section=sales` should resolve to the canonical route.
6. Inspect a typed editor. Evidence-backed controls remain editable. Other controls display **Partial** and are disabled until their consumer behavior and access tests are established.
7. Try an unsupported category/page and an external `returnTo` value. Invalid routes recover safely; external paths must not be rendered as return links.

## Profile appearance preferences

Route: `/profile` (Profile → Appearance card). Status: **PARTIAL**; colour mode and named palettes sync per user and organisation, while custom colour values remain on the current device.

1. Sign in to a dedicated non-production user who belongs to a test organisation; start the app with `npm.cmd run dev` and open `http://localhost:8080/profile`.
2. Select Light, Dark, and Use device setting. Each selection should update immediately and report a save in the UI.
3. Select a named palette, reload, and confirm the same preference is restored for that user and organisation.
4. Change to another test organisation and confirm that organisation's stored preference loads. Confirm a different user does not inherit the first user's preference.
5. Select Custom palette and confirm the existing custom colours are not replaced by a remote named palette. Reset custom colours and verify only this device's custom values reset.
6. Inspect `getPersonalAppearancePreferences` and `savePersonalAppearancePreferences` behavior through their unit tests. Each validates authentication; the server checks company membership, scopes reads/writes to `context.userId`, and rejects `custom` as a synced palette.
7. For a permissions failure or unavailable Supabase connection, confirm the existing local theme still works and a user-visible error is reported. Use no production account or hosted customer data for this check.

## Accounting account-code display

Route: `/settings/accounting/overview` → **Account code padding**, then `/accounting` → Chart of Accounts. Status: **IMPLEMENTED** for display formatting only; accounting module coverage remains **PARTIAL**.

1. In a dedicated non-production organisation, open the Accounting settings page as a user with `company.settings.edit` and set **Account code padding** to 4; save.
2. Open the Chart of Accounts. Numeric codes such as `21` should display as `0021`; codes already longer than the minimum remain unchanged; alphanumeric codes such as `A-21` remain unchanged.
3. Set the value back to 0 and confirm the display returns to the stored code.
4. Verify the database account codes and posted journal line references are unchanged. The setting affects the chart's visible labels only; search and exports use canonical stored values.
5. A user without settings edit permission may view the chart but cannot change the setting. Organization membership is checked on configuration reads; the write uses the existing permission-checked, versioned audit RPC.

## Tax rate and code master

Route: `/tax` → **Rates** and **Codes**. Status: **IMPLEMENTED** for the rate/code master lifecycle; jurisdiction-specific filing and regional regime configuration remain **PARTIAL**.

1. In a dedicated non-production organisation, grant a test user `tax.settings` and create a tax rate with a real start date, optional end date, and a basis-point rate from 0 to 10,000.
2. Confirm scheduled/current/ended status follows the effective dates. Use an end date earlier than the start date, an impossible date such as February 30, or a rate outside the allowed range; the form/server must reject it.
3. Create a tax code linked to the rate; confirm sales/purchase applicability and recoverability behave as configured in the tax selectors and calculations.
4. Edit the rate and code. Check `settings_change_log` has same-transaction before/after rows. Try cross-organisation reassignment; it must be rejected and create no cross-tenant audit record.
5. Confirm posted documents retain their captured tax amount/rate after master edits. Do not use production tax data or submit a tax filing as part of this review.
6. Review the isolated PostgreSQL commands/tests in the CI workflow: `tax-master-settings-audit.sql` and `tax-master-posted-history.sql`. The regional tax filing path is not covered by this capability.

## Manual-journal memo requirement

Route: `/settings/automation/overview` → **Require memo on manual journals**; consumer: manual journal posting. Status: **IMPLEMENTED** with migration `20261126180000_workflow_settings_audit.sql` (READY-TO-APPLY; hosted Supabase was not changed).

1. In a dedicated non-production organisation, enable **Require memo on manual journals** and save. Confirm the setting is permission-checked and its before/after event is visible to a user with `audit.view`.
2. Open a manual journal draft with two balanced lines, omit the memo, and attempt to post. The server must refuse it before journal creation and show the organisation-settings error.
3. Add a memo and retry using an approved disposable test organisation. The posting should follow the normal accounting path; do not use production data.
4. Disable the setting and confirm the same balanced test journal can pass memo validation without a memo. Do not post it unless a financial test fixture is approved.
5. Run `npm.cmd run test:workflows:postgres` to exercise transactional audit evidence, redaction of free-text settings, no-op metadata updates, RLS/tenant isolation, and rollback when audit insertion fails. The audit failure must also roll back the preference update.

## Sales document date defaults

Route: `/settings/sales/overview` → **Sales defaults**; consumers: new invoice due dates, quote expiry dates, and default notes. The terms default is superseded by a customer's own payment terms. Notes apply to invoices and quotes but not credit notes; the audit log redacts their text. These controls are server validated, saved through the existing permission-checked workflow settings function, and audited by the workflow settings trigger. Other Sales controls remain partial unless separately evidenced.

1. In a dedicated non-production organisation, set invoice payment terms to 45 days and quote validity to 60 days, then save. Confirm only the submitted Sales columns are persisted and the settings audit records typed before/after values.
2. Create a new invoice for a customer with no customer-specific terms and confirm the due date is 45 days after invoice date. Select a customer with 14-day terms and confirm the customer value takes precedence.
3. Create a new quote and confirm its expiry is 60 days after the quote date. Change the quote date and confirm expiry recalculates from the configured validity.
4. Set a default note and confirm it appears on new invoices and quotes, but is not copied to credit notes. Confirm the audit contains redacted markers rather than note text.
5. Set payment terms to 0 and confirm same-day due date; reject invalid/fractional or out-of-range values at both the Settings form and server boundary. Quote validity must be from 1 to 365 days.
6. Run `src/lib/sales/document-defaults.test.ts`, the workflow settings server tests, and `npm.cmd run test:workflows:postgres` for consumer precedence, permission-checked persistence, audit history, tenant isolation and rollback.

## Purchase bill default payment terms

Route: `/settings/purchases/overview` → **Purchases defaults**; consumers: new purchase bill due dates and notes. Supplier-specific payment terms take precedence over the organisation default; manual due-date overrides remain intact. Note text is redacted in audit history.

1. In a non-production organisation, set default purchase terms to 60 days and save. Confirm the `company.settings.edit` check and typed before/after audit event.
2. Create a bill for a supplier with no supplier-specific payment term and confirm the due date is 60 days after the bill date. Select a supplier with 14-day terms and confirm those terms win. Confirm the saved default note is on a new bill.
3. Set terms to 0 and confirm a same-day due date. Invalid, fractional, or out-of-range values must be rejected on save.
4. Edit the due date manually and confirm changing supplier does not overwrite the manual override.
5. Run `src/lib/purchases/bill-form-helpers.test.ts`, the workflow settings server tests, and `npm.cmd run test:workflows:postgres` to verify precedence, persistence, audit and tenant-safe rollback.

## Expense mileage and claim currency defaults

Routes: `/expense-management/settings`, `/expense-management/mileage` and `/expense-management/my-expenses/new`. These settings use only the organisation's base and enabled currencies. A foreign default requires multi-currency claims; mileage claim calculation continues to use the saved rate's own unit.

1. In a dedicated test organisation, set **Default distance unit** to miles and confirm a new mileage-rate form starts in miles. Select kilometres manually and confirm the explicit choice wins; save a mileage claim and confirm its selected rate controls the unit and amount.
2. Enable a test foreign currency in Organisation → Currencies, allow multi-currency claims, and select it as the default claim currency. Open a new employee claim and confirm its line-entry labels, totals, template matches and saved draft use that currency.
3. Confirm only templates recorded in the active currency are offered. Existing templates in another currency must not be loaded into a form that would reinterpret their minor-unit amounts.
4. Remove/disable a selected foreign currency and confirm the backend rejects it as a new default. Turn off multi-currency claims and confirm the default returns to the organisation base currency.
5. Use a base-currency cash advance, petty-cash float or company card and confirm the workflow does not offer it for a claim in a different currency.
6. Verify offline drafts retain their explicit currency and sync without changing their amount/currency pair. Use a dedicated non-production organisation and do not post test claims to live ledgers.
7. Set the receipt threshold and scan a claim at or above it without an attachment. Confirm it receives a high-risk review flag. The setting currently flags for review and does not block submission; verify the UI explains that behavior.

## Scope and permission review

- Tenant settings continue to use the existing server functions, membership checks, version checks and row-level security. Route visibility is not authorization.
- Profile preferences stay in the signed-in user's profile area; the Settings category links to that surface instead of treating a personal preference as company-wide.
- Platform-owner controls remain outside tenant settings.
- Configuration secrets are not indexed by settings search.
- A setting marked **Partial** must not be treated as an operative accounting rule.
- Search Settings for “cash drawer” and open Point of Sale. Confirm both links reach `/pos/registers` and `/pos`, and that missing tax/tender controls are described as incomplete rather than presented as configurable settings.

## Responsive and accessibility review

- Review at 320, 390, 768 and desktop widths.
- Navigate the category groups, search, breadcrumb and forms by keyboard; verify visible focus and Escape behavior in the command palette.
- Check headings, breadcrumb `aria-current`, labels, descriptions, disabled/partial status, inline validation and save status with a screen reader.
- Confirm sticky save actions do not cover fields at mobile widths and unsaved edits are preserved when a navigation blocker is dismissed.

## Test environment

The `e2e/settings-navigation.spec.ts` cases require an authenticated test account supplied through `E2E_EMAIL` and `E2E_PASSWORD`. The local browser at `http://localhost:8080/settings` loaded the Settings Centre after refresh, but no authenticated end-to-end save or permission flow was run. Use a dedicated, non-production test organisation for those tests.

## Known review boundaries

The registry and coverage matrix enumerate every typed config field and every registered application module. They do not claim every module-specific setting has been consolidated into this workspace. See `coverage-matrix.md` and `defect-register.md` for unresolved implementation and test evidence.

### Report basis and personal appearance

- In a test organisation, open Settings → Reports → Default reporting basis. In Accounting choose Cash and save. Open profit and loss, then balance sheet, with no saved view or URL overrides. Both should open on cash basis. Select Accrual inside one report and confirm that its explicit choice takes precedence.
- For an existing test user with organisation-scoped appearance preferences and no account-wide preference, open Profile → Appearance. Expect the most recently saved accessible palette. Save a different palette, switch organisations, and sign in on a second device with the same account. Expect the newly saved account-wide palette. A separate user should see their own preference.

### Portal invitation controls

Open Settings → Portals with a dedicated test organisation. A read-only member should be unable to edit settlement accounts. As an authorised administrator, clear the invitation lifetime or enter 91 and verify the inline validation. Set a valid lifetime and require an authenticator, save, and issue a test invitation. Even if the staff checkbox is clear, the new membership should require MFA and expire after the configured number of days. Hosted execution requires the portal MFA migration and approved test identities.

### Bank statement formats

In a test organisation, open Settings → Banking and select only OFX/QFX. Save and reload. In Banking → Import, selecting a CSV should show the format is unavailable. Preview an OFX file, turn off OFX in a second tab, then return and submit the preview. Expect rejection before an import history record or statement row is created.

### Nonprofit ledger setup

Search Settings for “restricted funds”, then open Fund accounting setup. Using a test organisation, open setup in two tabs. Save a country or mapping change in the first, then try saving the older draft. The stale save should be rejected and existing segregation, gateway and deficit policies should retain their values. A read-only user should be able to inspect setup without submitting edits. Verify Settings navigation with keyboard and narrow viewport. The save requires migration 20261128222000.
