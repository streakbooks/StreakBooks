# QIF bank statement import — clean-room feature design

**Priority:** P0 banking · **Date:** 4 November 2026 · **Schema migration:** none · **Dependencies:** none.

## Public behavior and independent design
QIF is a line-coded historical bank statement format. Public bank format specifications document `!Type:Bank` sections, `D` dates, `T` signed amounts, `P` payees, `M` memos, `N` references and `^` transaction terminators. Some banks export day-first dates (AU/NZ/UK); others export month-first dates (US). QIF has no authoritative per-transaction bank ID or currency and may contain splits or multi-account exports.

References (feature concepts only, no source/code/artwork copied):
- Westpac Australia export specification (QIF date variants): https://www.westpac.com.au/content/dam/public/wbc/documents/pdf/col/accountsexportformats.pdf
- Westpac New Zealand export overview: https://assets.dam.westpac.co.nz/is/content/wnzl/dist/ways-to-bank/digital/business-online/Business-Online_Transaction-Import-and-Export-File-Formats_guide.pdf

## Backend / security
No new endpoint or DB migration. The existing `previewBankImport` and `importBankStatement` enforce `banking.import`, check tenant-scoped bank account identity, perform idempotent/duplicate checks and store an auditable import record. The adapter converts `!Type:Bank` or `!Type:CCard` QIF into a normalized CSV text compatible with the existing `applyMapping` and `assignExternalIds` pipeline. No automatic ledger posting or category mapping.

## Frontend / UX
Accept `.qif`, require user to explicitly choose **day-first** or **month-first**; do not guess from regional account settings. Preview normalized dates, amounts and duplicate warnings before import. Explain QIF omits currency/account identity and user must select the correct bank account. Explicitly reject unsupported investments, multi-account, splits, malformed dates, duplicate mandatory tags, incomplete records and oversized files.

## Quality gates and acceptance
- Table-driven tests for two- and four-digit years, locale ambiguity, compact/named dates, leap-year validation, quoting, memo, signs, duplicates, malformed sections/records and 5 MB limit.
- Re-uploading the same source produces stable content keys; two legitimate identical lines in one statement remain distinct.
- Existing authorized import server handler, transaction matching, audit trail, CSV and OFX/QFX paths must remain unchanged.
- Run typecheck, ESLint, unit tests, isolated PostgreSQL, navigation and production build on the exact branch commit; signed-in staging remains separate.
- Sample QIF test data is synthetic; no live bank data, credentials or third-party code were imported.

## Known limitations
QIF does not contain FITID, balance or currency. Duplicate matching is heuristic and must be reviewed; transfer/category metadata is not auto-posted. Complex split statements and multiple-account exports require separate future workflow. Two-digit years follow StreakBooks' existing <70 => 2000+, >=70 => 1900+ policy; display normalized dates for confirmation.
