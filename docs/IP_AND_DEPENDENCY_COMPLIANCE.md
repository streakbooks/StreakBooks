# LinkBooks — IP & dependency compliance register

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Owner** | Engineering / product |
| **Related** | [THIRD_PARTY.md](./THIRD_PARTY.md), [CLEAN_ROOM.md](./CLEAN_ROOM.md), [premium-ui/LEGAL_ASSET_LICENSE_REGISTER.md](./premium-ui/LEGAL_ASSET_LICENSE_REGISTER.md) |

## Policy summary

1. **Original product:** LinkBooks must remain independently developed and distinctly branded — not a clone of Odoo, Xero, QuickBooks Online, Zoho Books, Sage, MYOB, ERPNext or any other competitor.
2. **Competitor use:** Public feature documentation may inform *what* workflows accountants need. It must never be used as a source of code, layouts, CSS, icons, copy, field names or report artwork.
3. **Odoo / copyleft:** Do not import Odoo source. Prefer independent implementation. Any proposed OSS reuse requires license review before merge.
4. **Trademarks:** Competitor names may appear only in factual comparison docs; never in product UI in a way that implies affiliation or endorsement.
5. **Dependencies:** New direct dependencies must be recorded in [THIRD_PARTY.md](./THIRD_PARTY.md) with SPDX license before merge. Reject proprietary / uncertain / viral copyleft additions pending legal decision (existing tree still needs full transitive audit as a release gate).
6. **Generated code:** Review agent/LLM output for substantial similarity to known competitor implementations before merge.
7. **Release block:** Unresolved licensing or IP concerns block marking a feature Complete and Verified.

## Compliance checklist (every feature PR)

| Check | Required evidence |
|-------|-------------------|
| Clean-room note | Concept references (URLs) + statement that no competitor source/assets were copied |
| Design system | Uses LinkBooks `ListWorkspace` / `RecordWorkspace` / tokens where applicable |
| Posting engine | Reuses authoritative LinkBooks posting paths; no parallel ledger |
| Dependencies | No new packages, or packages listed in THIRD_PARTY.md with SPDX |
| Similarity review | Author asserts original LinkBooks vocabulary and workflows |
| Gap register | Status updated; not marked verified without acceptance evidence |

## Milestone log

| Date | Milestone | IP outcome |
|------|-----------|------------|
| 2026-11-04 | Accounting FX / reporting / QIF batches | No new deps; clean-room recorded in CLEAN_ROOM.md |
| 2026-11-17 | Historical Aged Payables (as-at) | No new npm packages; original `ap-asat` maths mirroring LinkBooks AR as-at contract; competitors referenced only as public aged-payables capability |
| 2026-11-17 | PO goods receipt foundation | No new npm packages; original `po-receipt` maths + RPC; public PO receiving concepts only; no competitor UI/code |
| 2026-11-17 | PO three-way match | No new npm packages; original `po-three-way-match` maths; uses existing `purchases.three_way_matching` setting; public 3-way match concepts only |
| 2026-11-17 | Partial bill-from-received | No new npm packages; original `po-partial-bill` maths; convert bills unbilled received qty only; no competitor code; no inventory valuation claim |
| 2026-11-17 | Purchase bill void_date | No new npm packages; records void date/reason for AP as-at; reuses existing ReasonDialog; inventory still not claimed |
| 2026-11-17 | Supplier credit void_date | No new npm packages; parity with B5 bill void; shared void-date helper; ReasonDialog; no competitor code |
| 2026-11-17 | Supplier statement opening balance | No new npm packages; reuses AR statement builder with AP nouns; public statement concepts only |

## Open compliance items

| ID | Item | Status |
|----|------|--------|
| IP-01 | Full transitive npm license inventory | Open — release gate |
| IP-02 | Counsel review of brand / competitor-name usage in public marketing | Open |
| IP-03 | Font / icon provenance already partially tracked in LEGAL_ASSET_LICENSE_REGISTER | Partial |
