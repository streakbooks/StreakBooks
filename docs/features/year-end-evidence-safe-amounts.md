# Feature: accurate year-end evidence and exact minor-unit boundaries

**Priority:** P0 accounting integrity · **Date:** 4 November 2026 · **Migration:** none

## Problem
Period-close facts and year-end preview previously treated any journal with a matching idempotency key as proof of a completed close, including drafts or reversed journals. Year-end profit, journal-preview line amounts and opening-balance equity were converted from exact BigInt minor units to JS Number without checking safe-integer limits. Silent precision loss is unacceptable in accounting.

## Independent implementation
- Keep every posted journal and database function unchanged.
- Year-end status and preview require a **posted, unreversed** closing journal, filtered within the requested company and idempotency key. Database errors fail visibly.
- Shared `toSafeMinorNumber(bigint, label)` guards transitional number-only UI/API boundaries, rejecting values beyond +/- Number.MAX_SAFE_INTEGER rather than rounding. New APIs should migrate to exact minor-unit strings for full bigint coverage.
- In the year-end posting handler, validate the response amount before `postJournal` to avoid posting successfully and then throwing on unsafe conversion.
- Add tests for the bound, negative amounts, reversed close, SQL errors and large opening equity.

## Acceptance and limitations
- Valid close evidence only for active posted journals; a reversed record cannot claim completion.
- Safe amounts remain the same and posting engine uses BigInt without changes.
- No new schemas, packages or financial postings. Existing large-amount *preview* throws an explicit error until the frontend is upgraded to exact-string semantics.
- Idempotency behavior when deliberately reversing and reposting a closing journal needs a separate posting-engine audit.
- Requires GitHub TypeScript/ESLint/full unit/PostgreSQL/build and authenticated staging sign-off before financial certification.
