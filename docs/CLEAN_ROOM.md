# Clean-room implementation protocol — LinkBooks

## Independent design boundary
- Benchmark only publicly documented **behaviors, categories, accounting requirements and acceptance scenarios** of Odoo and Xero.
- No copying of source code, SQL, CSS, templates, translations, report labels, marketing copy, imagery, icons, layouts, visual arrangement, or internal field names from either product.
- Odoo Community and Enterprise availability differs. Even if source may be inspectable under an open-source license, **no Odoo code is reused** here.
- Xero is proprietary. Public API/feature documentation can define interoperability contracts, not reusable implementation assets.
- Derive algorithms from double-entry principles, jurisdiction requirements and LinkBooks' own existing data contracts. Review independently for IP, correctness and accessibility.

## Work record
| Feature / milestone | Reference observed only at concept level | Independent LinkBooks design and evidence |
|---|---|---|
| Existing reporting explorer (PR #18, already on main) | Public general concepts of filters, saved views and multi-period reporting | Own `src/lib/reports/report-explorer.ts` and UI, URLs and tests; no third-party source included. |
| Repository hygiene (first new milestone) | Generic software-engineering secret protection; no competing product implementation | Own Node.js Git tracking/ignore checks, CI gate, secure local setup. No dependency additions. |
| Planned ledger/period acceptance | Double-entry accounting invariants and LinkBooks posted-ledger behavior | Build tests from own journal/RPC and period-lock rules; avoid migrating or rewriting posted journal data. |
| Planned regional tax contracts | Public HMRC, ATO, IRD and US jurisdiction guidance | Own regional rules, fixture tables and source-linked documents; separate jurisdiction-specific sign-off. |
| Planned scalable reporting | Public report workflow expectations | Own ledger-safe SQL pagination, authorized capture, grouping with explicit reconciliation and exact amount types. |

## Mandatory review for each future feature
1. Record public *concept* references by URL and date.
2. Write the data/API/UI design using LinkBooks vocabulary and existing stack.
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

