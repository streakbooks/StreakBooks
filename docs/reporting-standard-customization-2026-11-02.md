# Standard reporting customization — 2026-11-02

## Reference review

Reviewed the supplied QBO/Xero screenshots and publicly documented report controls. This was a public documentation review, not access to every tab of a signed-in paid product. StreakBooks uses its own components, layout and accounting engine.

Primary references:

- [QuickBooks modern report customization](https://quickbooks.intuit.com/learn-support/en-us/help-article/customize-reports/create-custom-reports-quickbooks-online-advanced/L1LHo5Ti2_US_en_US): grouping, filters, presentation, period comparisons, saved reports and delivery controls.
- [QuickBooks standard report customization](https://quickbooks.intuit.com/learn-support/en-us/help-article/customize-reports/customize-reports-quickbooks-online/L0gKmSawG_US_en_US): statement comparisons, change columns, collapsed detail and reusable views.
- [Xero Profit and Loss](https://central.xero.com/0/article/Profit-and-Loss-New) and [Balance Sheet](https://central.xero.com/0/article/Balance-Sheet-New): period and comparison selection, account visibility and additional statement settings. Xero's full article bodies were not readable through the research tool; available indexed excerpts and user screenshots informed this part of the review.

## Implemented controls

| Control | StreakBooks behavior |
|---|---|
| Reporting period | Custom dates and eleven calendar/fiscal presets; the actual company's year end is used. |
| Columns | Selected total, clipped calendar months, quarters or years; optional P&L total. Requests exceeding 24 period columns fail explicitly. |
| Comparison | Independent previous period, previous year, fiscal YTD, previous fiscal YTD and custom ranges. BS comparisons use closing dates and each date's fiscal-year split. |
| Change amount | Exact selected-period amount minus comparison amount. |
| Change percentage | Exact difference divided by absolute comparison amount; zero denominator is Unavailable. |
| Percentage columns | P&L trading income, total expenses or selected-period row; BS total assets or selected-period row. Denominators are named explicitly. |
| Detail | Account detail or section totals; individual headings can collapse account lines while retaining financial totals. |
| Zero accounts | Include unused active posting accounts; inactive accounts with actual activity remain reportable. Filtered statements include matching activity only. |
| Presentation | Account codes, currency/whole/two/three decimals, scale, currency labels, negative style/red color, zero/dash/blank, compact rows. |
| Notes | Header, subtitle, footer, report notes, accounting-basis and posted conversion notes. |
| P&L filters | Existing bounded AND/OR posted-line filters with actual company account/type/group/currency/source choices. |
| Save/reopen | Validated settings persist with existing saved views and URL state; recent activity retains bounded customization metadata. |
| Drill-down | Numeric account cells link to the selected column's actual dates; comparison cells do not drill into the current period. |
| Refresh | Explicit refresh plus query invalidation on applied period/settings changes. |
| Exports | PDF, Excel and CSV from the shared server-generated document; full permission and audit checks. |
| Saved exports/delivery | Saved-view capture and queued/scheduled attachments use the same standard period snapshot and renderer. Real provider delivery remains unverified. |
| Feature availability | The existing reporting entitlement controls customization. Core standard statements remain available through the original report runners when optional customization is frozen. No second billing system. |

The old standard-report presentation and authoritative source runners are retained for core read access. Financial settings are never silently discarded: unavailable customization with saved settings shows an explicit error and an action to open the standard statement.

## Accounting and capture

`standard-settings.ts` validates settings; `standard-statement.ts` defines bounded periods and exact rational presentation; `standard-captured.ts` reuses existing accounting builders. Server functions capture facts instead of accepting client-calculated balances. Document construction checks the captured period plan and filter provenance before displaying or exporting.

The database captures each requested period, including each BS date's prior/current fiscal balances. Queued attachments retain configuration and facts together. Monetary calculations remain BigInt/exact decimals; the Excel display precision does not replace the underlying exact numeric cell value. Large values continue to remain text when Excel would lose significant digits. Existing immutable pack review and sharing controls are unchanged.

Applied to connected Supabase project `ipxflpzfcqwtenodbxwc`:

- `20261102180106_reporting_standard_statement_capture.sql`: invoker capture RPC, bounded activity metadata and settings-aware outbox capture.
- `20261102180107_reporting_statement_percentage_basis.sql`: explicit permitted percentage bases for P&L and BS.

Migration files were created using Supabase CLI 2.122.0, then ordered after existing same-day prerequisites. Generated types include the new RPC. No migration-history repair, posted-ledger write or real email send occurred.

## Verification and limits

Exact comparisons, negative/zero denominators, custom dates, fiscal/leap dates, overflow limits, zero accounts, summary/collapse, percentage bases, saved settings and real PDF/XLSX/CSV files have automated coverage. API tests reject invalid requests and missing permissions and prove that client-supplied facts are ignored. Component-browser tests verify customization, applying changes, input errors, saved configuration and responsive navigation. These are separate from a full signed-in browser-to-database workflow.

The expanded live PostgreSQL fixture verifies actual posted amounts, monthly/prior/custom/filtered periods, BS date/FY splits, tenant denial, anonymous denial and customized outbox snapshots. Fixtures roll back and do not send email. Security/performance advisors were checked; only the previously documented reporting definer warning and unused-index informational notice remain in the reporting-related results.

Still incomplete: cash-basis P&L/BS recognition, tracking/customer/product/department dimension attribution, arbitrary presentation-currency translation, budget/forecast standard-statement columns, all other report-type customization parity, deployed concurrency/soak evidence, real email delivery and independent release review. The baseline acceptance scorecard is not upgraded by source/UI-only evidence. This change is not full QBO/Xero parity or production certification.


Final implementation checkpoint before integrating newer main: **179 files / 1,424 unit tests, 15 reporting browser scenarios, TypeScript, production build, changed-source lint and 131 shared lookup declarations / zero violations pass**. Worker version **9** is ACTIVE with renderer bundle SHA-256 `4a711802b44a3156660155df788ad4b692403080c4d0c527831afdefad144800`. Customizations are encoded compactly with an explicit link-size limit; oversized notes/selections show a validation message instead of creating an unreliable URL. Read-only report capture uses POST to avoid putting the API payload into a second request URL.

Review also verified historical BS default dates, the old six-date BS view, core statement access while customization is frozen, saving the default standard configuration, and saved document titles. Newer main contains separate native-navigation improvements; those are integrated without discarding this work and require a fresh validation checkpoint.


## Combined-main verification

Integrated main `4996511` without conflicts or history rewriting. The combined branch passes **179 files / 1,425 unit tests**, TypeScript, production build, changed-source lint, the native navigation source audit (23 files / 11 report tabs), 131 shared lookup declarations / zero violations, and all **five native-navigation browser scenarios**. Standard-report component-browser coverage contains **15 scenarios**. Live PostgreSQL and real file evidence are described above; no production email delivery or full authenticated acceptance certification is implied.
