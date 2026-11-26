# Settings coverage matrix

**Updated:** 2026-11-26  
**Evidence rule:** a capability is `IMPLEMENTED` only when the code registry names a UI, persistence mechanism, server validation, permission, audit record, a real consumer and a behavior test. Otherwise it remains `PARTIAL`, `PLACEHOLDER`, `MISSING`, `BLOCKED` or `NOT APPLICABLE`. Category badges do not promote individual settings.

## Capabilities with complete evidence

The machine-readable subset is `src/lib/settings/capability-registry.ts`; its contract tests are in `src/lib/settings/capability-registry.test.ts`.

| Capability                   | UI / route                                                        | Persist / validate / permission                                                     | Audit / consumer                                                                                   | Test                                                                   | Status          |
| ---------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------- |
| Accounting lock dates        | `SettingsAccountingLocksPanel`; `/settings/accounting/overview`   | `organisation_lock_policy`; CAS RPC; server date checks; `periods.lock`             | `settings_change_log`; `assert_journal_date_unlocked` blocks journal posting                       | `tests/integration/settings-lock-policy-cas.sql`                       | **IMPLEMENTED** |
| Default reporting basis      | Typed category editor; `/settings/reports/overview`               | `organisation_config`; Zod enum; `company.settings.edit`                            | `settings_change_log`; reporting basis service feeds report APIs                                   | `src/lib/reports/accounting-basis.test.ts`, cash-report function tests | **IMPLEMENTED** |
| Account code display padding | Typed Accounting category editor; `/settings/accounting/overview` | `organisation_config.accounting`; Zod integer 0–8; `company.settings.edit`          | `settings_change_log`; Chart of Accounts formats numeric code labels without changing stored codes | `src/lib/accounting/chart-view.test.ts`                                | **IMPLEMENTED** |
| Classes feature enablement   | Feature Manager; `/settings/features/overview`                    | `organisation_features`; allowlisted RPC/dependency guards; `company.settings.edit` | `settings_change_log`; sales/purchase forms gate class fields                                      | `tests/integration/settings-feature-disable-guard.sql`                 | **IMPLEMENTED** |

## Module coverage

This table is synchronized with `MODULE_SETTINGS_COVERAGE`, which is checked against every ID in `src/lib/modules/registry.ts`. “Expected” describes the work to map or build; it does not claim the setting exists today.

| Module              | Expected settings                                            | Status                                                                                                                                             |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard           | Dashboard and display preferences                            | **PARTIAL**                                                                                                                                        |
| Banking             | Feeds, rules, imports and reconciliation                     | **PARTIAL**                                                                                                                                        |
| Point of Sale       | Register, locations, taxes and tenders                       | **MISSING**                                                                                                                                        |
| Sales               | Invoice, quote, reminders and payment defaults               | **PARTIAL**                                                                                                                                        |
| Purchases           | Bills, suppliers, purchase orders and approvals              | **PARTIAL**                                                                                                                                        |
| Expenses            | Claims, limits, approvals and reimbursement                  | **PARTIAL**                                                                                                                                        |
| CRM                 | Pipelines, territories and CRM defaults                      | **PARTIAL**                                                                                                                                        |
| Property Management | Property, owner, agreement and settlement policies           | **PARTIAL**                                                                                                                                        |
| HR                  | Organisation, leave and workforce policy                     | **PARTIAL**                                                                                                                                        |
| Contacts            | Numbering, terms, groups and tags                            | **PARTIAL**                                                                                                                                        |
| Products & Services | Items, stock, valuation and price defaults                   | **PARTIAL**                                                                                                                                        |
| Files               | Retention, access and upload policy                          | **PARTIAL**                                                                                                                                        |
| Accounting          | Periods, close policy, journals and dimensions               | **PARTIAL** (lock dates and reporting basis are implemented; unenforced warnings stay read-only)                                                   |
| Budgets             | Budget periods, dimensions and alerts                        | **PARTIAL**                                                                                                                                        |
| Projects            | Project, time and allocation defaults                        | **PARTIAL**                                                                                                                                        |
| Fixed assets        | Asset classes, depreciation and disposal defaults            | **PARTIAL**                                                                                                                                        |
| Payroll             | Schedules, accounts and components                           | **PARTIAL**                                                                                                                                        |
| Reports             | Basis, comparison, views and schedules                       | **PARTIAL** (basis is implemented)                                                                                                                 |
| Tax                 | Regime, codes, rates and region support                      | **PARTIAL** (rate/code changes are transactionally audited and posted history is guarded; regional regime and reporting effects remain unverified) |
| Find an advisor     | Discovery and client checkout                                | **PARTIAL**                                                                                                                                        |
| Accountant          | Workflow defaults and review access                          | **PARTIAL**                                                                                                                                        |
| Firm                | Client grants, staff roles, seats and firm billing           | **PARTIAL**                                                                                                                                        |
| Advisors admin      | Service catalogue, delivery and advisor access               | **PARTIAL**                                                                                                                                        |
| Advisor portal      | Client portal preferences and notifications                  | **PARTIAL**                                                                                                                                        |
| Action Center       | Alert preferences and workflow routing                       | **PARTIAL**                                                                                                                                        |
| App Store           | Marketplace app and connection settings                      | **PARTIAL**                                                                                                                                        |
| Developer           | API keys, OAuth applications and webhooks                    | **PARTIAL**                                                                                                                                        |
| Messages            | Messaging and notification policy                            | **PARTIAL**                                                                                                                                        |
| AI Assistant        | AI access, spend and confirmation policy                     | **PARTIAL**                                                                                                                                        |
| Settings            | Tenant configuration and preference navigation               | **IMPLEMENTED** as a shell; field coverage remains partial                                                                                         |
| Help                | No organisation configuration surface                        | **NOT APPLICABLE**                                                                                                                                 |
| Platform            | Platform-owner settings separate from tenant scope           | **PARTIAL**                                                                                                                                        |
| Profile             | Personal profile and preferences                             | **PARTIAL**                                                                                                                                        |
| Onboarding          | Initial organisation setup and safe defaults                 | **PARTIAL**                                                                                                                                        |
| Auth                | Authentication screens; policy owned by server configuration | **NOT APPLICABLE**                                                                                                                                 |

## Known gaps

The machine-readable `SETTINGS_GAPS` entries track: company identity/locale consumer evidence; unenforced accounting warning and auto-credit settings; tax regime/source-of-truth, jurisdiction, effective-date calculation and reporting-consumer evidence (tax rate/code edits now write same-transaction before/after audit records); incomplete sales and purchase typed settings; central banking settings not proven to drive every module control; MFA/idle timeout preferences without end-to-end auth enforcement evidence; provider connection delivery evidence; and account-wide preference scope plus custom palette sync. Colour mode and named palettes currently sync per user and organisation from the profile.

Further gaps recorded in `docs/settings/audit.md` include inventory valuation source-of-truth, tax/regional limitations, fixed-asset and time workflows, approval coverage, exports/retention, module-level settings ownership, full screen-reader and mobile verification, and legacy route compatibility. Promote a row only with a behavior-changing test and evidence for all fields in the capability contract.

## Typed field inventory

`SETTING_FIELD_COVERAGE` is generated from every key in `CATEGORY_SCHEMAS` and checked against the schema shapes by `validateSettingsCapabilityRegistry()`. Each record includes the category, route, schema, persistence path, audit record and consumer evidence status. A field is editable only if it also appears in the complete capability registry. Other typed fields are shown as **Partial** and disabled. This is a deliberate safety state, not a claim that those features are complete.

| Typed field status | Count | Meaning                                                                                   |
| ------------------ | ----: | ----------------------------------------------------------------------------------------- |
| Complete           |     2 | `accounting.reporting_basis` and `accounting.account_code_padding` have tested consumers. |
| Partial            |    41 | Persisted schema keys without the full field-level access and consumer proof.             |

The separate complete capabilities `accounting.lock_policy` and `features.classes` are not fields in `CATEGORY_SCHEMAS`; they use their own established settings panels and guarded persistence paths.
