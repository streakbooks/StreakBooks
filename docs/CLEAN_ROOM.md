# Clean-room implementation protocol — StreakBooks

## Independent design boundary

- Benchmark only publicly documented **behaviors, categories, accounting requirements and acceptance scenarios** of Odoo and Xero.
- No copying of source code, SQL, CSS, templates, translations, report labels, marketing copy, imagery, icons, layouts, visual arrangement, or internal field names from either product.
- Odoo Community and Enterprise availability differs. Even if source may be inspectable under an open-source license, **no Odoo code is reused** here.
- Xero is proprietary. Public API/feature documentation can define interoperability contracts, not reusable implementation assets.
- Derive algorithms from double-entry principles, jurisdiction requirements and StreakBooks' own existing data contracts. Review independently for IP, correctness and accessibility.

## Work record

| Feature / milestone                                   | Reference observed only at concept level                                            | Independent StreakBooks design and evidence                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Existing reporting explorer (PR #18, already on main) | Public general concepts of filters, saved views and multi-period reporting          | Own `src/lib/reports/report-explorer.ts` and UI, URLs and tests; no third-party source included.                  |
| Repository hygiene (first new milestone)              | Generic software-engineering secret protection; no competing product implementation | Own Node.js Git tracking/ignore checks, CI gate, secure local setup. No dependency additions.                     |
| Planned ledger/period acceptance                      | Double-entry accounting invariants and StreakBooks posted-ledger behavior             | Build tests from own journal/RPC and period-lock rules; avoid migrating or rewriting posted journal data.         |
| Planned regional tax contracts                        | Public HMRC, ATO, IRD and US jurisdiction guidance                                  | Own regional rules, fixture tables and source-linked documents; separate jurisdiction-specific sign-off.          |
| Planned scalable reporting                            | Public report workflow expectations                                                 | Own ledger-safe SQL pagination, authorized capture, grouping with explicit reconciliation and exact amount types. |

## Independent implementations delivered 4 November 2026

| StreakBooks feature                                                | Public concept source                                      | Original StreakBooks implementation                                                                                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger-health permission and complete evidence contract (PR #21) | Double-entry and financial-audit principles                | Added strict eight-check schema validation to existing `src/lib/accounting/ledger-health.ts`, request-company binding, `accounting.view` server guard and own Vitest fixtures. No third-party code reused. |
| Year-end evidence and exact amount guards (PR #22)               | General financial close and safe-integer principles        | Implemented posted/unreversed journal evidence, error propagation and bounded BigInt conversions using existing StreakBooks journals. Tests derive from independent accounting invariants.                   |
| Accessible Ledger Health workspace (PR #23)                      | Generic audit readiness and accessibility principles       | Mounted the pre-existing StreakBooks panel as native `/accounting?tab=health`; state key prevents company-result carryover; semantic heading, tests and scoped read-only interaction.                        |
| Multi-account GL presentation (PR #20)                           | Generic ledger selection and report filtering capabilities | Original account-picker components, server company access and account inclusion rules in StreakBooks' existing reporting catalogue.                                                                          |

No new npm dependencies, competitor source files, CSS, templates, icons, translations, logos or report artwork were added by PR #21–#23.

## Mandatory review for each future feature

1. Record public _concept_ references by URL and date.
2. Write the data/API/UI design using StreakBooks vocabulary and existing stack.
3. Document new third-party packages and verify each is permissively licensed (MIT, Apache-2.0, BSD); do not add proprietary or viral/copyleft dependencies to application bundles.
4. Submit original implementation to code review, code similarity/licensing review, and tests.
5. Retain source-to-report financial traceability; no misleading compliance claims.
6. Record acceptance limitations in `docs/REVIEW_GUIDE.md` and do not claim background/later verification that did not run.

## Public feature research on 3 Nov 2026

- https://www.odoo.com/documentation/19.0/applications/finance/accounting.html
- https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting.html
- https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/analytic_accounting.html
- https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/transactions.html
- https://www.xero.com/us/accounting-software/all-features/
- https://www.gov.uk/government/collections/making-tax-digital-for-vat
- https://www.ird.govt.nz/gst/filing-and-paying-gst-and-refunds/filing-gst

These are **links**, not included third-party code or copied wording.

## 4 November banking and tax clean-room implementation record

| Feature                             | Concepts reviewed                                                                                                                  | Independent StreakBooks work                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QIF single-account intake, PR #26   | Published Westpac Australia and New Zealand QIF statement field descriptions and date variants; historical QIF file behaviors only | Original `src/lib/banking/qif-import.ts` and tests, explicit date order UI, integration with existing StreakBooks preview/permission pipeline; no reused source/branding/layout |
| Bank input integrity, PR #27        | Double-entry ledger and standard numeric/date correctness                                                                          | Original pure request validation and tests, safe minor-unit boundary; existing bank database permissions and posted records unchanged                                         |
| Tax numeric input integrity, PR #28 | Mathematical precision and typed inclusive/exclusive tax contracts, no copied competitor logic                                     | Guarded BigInt/Number, quantity precision and treatment handling within original StreakBooks tax engine; no new rates or country filing logic                                   |

Public bank format references:

- https://www.westpac.com.au/content/dam/public/wbc/documents/pdf/col/accountsexportformats.pdf
- https://assets.dam.westpac.co.nz/is/content/wnzl/dist/ways-to-bank/digital/business-online/Business-Online_Transaction-Import-and-Export-File-Formats_guide.pdf

No competitor code, SQL, CSS, templates, icons, imagery, translations or layouts were imported for these milestones.

## Original accounting FX safety work, 4 November 2026

| Feature                                 | General accounting concept                                                                                                               | Independently written StreakBooks code                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #32 journal posting and source rates | Exchange rates must be date-specific, positive and explicitly verified for foreign currencies; invalid financial inputs cannot post      | Added fail-closed rate handling, exact minor-unit transport and calendar validation in the existing StreakBooks `posting-engine.ts`. No borrowed vendor code or design. |
| PR #33 posted rate lineage              | Historical reports must use posted snapshot exchange rates and must not fabricate a 1:1 conversion; values must remain numerically exact | Original checks in StreakBooks `fx.ts` and `ledger-data.ts`, with synthetic conversion/incomplete-snapshot tests.                                                       |
| PR #31 cash reporting pagination        | Bounded report pages with continuous opening/running balances                                                                            | Other agent's original StreakBooks cash recognition and paging implementation, separate from this FX work.                                                              |

These milestones add no competitor source, report artwork, UI templates, brand assets, fonts or third-party translations.

## Originality-first policy (mandatory from 2026-11-17)

StreakBooks remains an independently developed product. Competitors are references for functionality and workflow completeness only. Do not copy proprietary source, layouts, illustrations, logos, branding or documentation. Prefer independent implementation over Odoo (or other) open-source reuse; review any proposed dependency license before merge. See [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md).

## Historical Aged Payables (as-at), 17 November 2026

| Feature                         | Public concept only                                                                  | Independent StreakBooks work                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aged Payables as at a past date | Public aged-payables / supplier ageing capabilities in Xero, QBO, Odoo documentation | Original `src/lib/purchases/ap-asat.ts` maths and `ap-reports.functions.ts` loader, aligned to StreakBooks AR as-at contracts; Reports UI reuses existing StreakBooks report shell. No competitor source, CSS, templates or artwork. |

No new npm dependencies. Deleted allocations reconstruct only from StreakBooks `cash_allocation_history` (post-install). Pre-archive deletions remain unrestorable by design honesty.
