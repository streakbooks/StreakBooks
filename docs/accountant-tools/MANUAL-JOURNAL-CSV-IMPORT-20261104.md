# Manual journal CSV import — implementation and acceptance

## Delivered

- Add CSV import to the existing manual journal form; no direct database writes.
- Provide a downloadable CSV header template with the exact fields: account_code, description, debit, credit.
- Parse RFC-4180 quoted fields, commas, escaped quotes, BOM and Windows/Unix line endings.
- Match account codes to the active organisation's posting-enabled, noncontrol account list.
- Enforce exactly one debit or credit per row, 2–200 journal lines, file limit 256 KB, valid nonnegative currency decimals and exact balanced integer-minor totals.
- Reject unknown/inactive/control or ambiguous account codes, unsafe integer amounts, rounding to extra currency decimals, malformed CSV and unbalanced totals.
- Import validated lines into the existing **unposted** manual journal editor, preserving human review of date and memo.
- Posting remains a separate action through the existing company-authorized, lock-date-aware and idempotent manual journal API.
- Do not enable this feature for recurring journal template editing.

## Finance and security boundaries

CSV upload is entirely client-side preparation; there is no remote batch import endpoint, automatic post, cross-organisation account match or hidden accounting adjustment. The server must still enforce organisation authorisation and posting-engine journal validation. A user-supplied file cannot override account IDs: they are resolved from the current company's loaded chart of accounts.

## Local acceptance

1. Open Accounting > Post manual journal using a nonproduction test organisation.
2. Download the CSV template and fill two lines with real posting-enabled account codes.
3. Upload it and confirm the editor displays the lines and remains unposted.
4. Verify that invalid account codes, tax-control accounts, negative amounts, mismatched totals and excess precision are rejected before replacing current editor lines.
5. Check that a valid journal posts only after clicking the existing Post journal button and confirming, and that closed-period posting remains blocked.
6. Check keyboard and screen reader labels, mobile layout, and company switching with a second organisation.
7. Verify large files above 256 KB fail before reading and the 200-line limit is enforced.

## Not claimed

This is a **single manual journal draft import**, not a bulk automation tool posting many independent journals or a complete approvals/evidence workflow. Full CSV staging, bulk approvals, file attachments and accounting import history remain additional roadmap items.
