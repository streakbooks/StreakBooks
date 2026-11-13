# HR Management — Progress

**Last updated:** 2026-11-09  
**Branch:** `feature/hr-management-batch00-foundation` (local WIP)

## Batch status

| Batch | Status |
|-------|--------|
| HR-00 … HR-15 | Code + linked production SQL applied; acceptance mostly `implemented-untested` |
| Demo workforce seed | Applied `20261109260000` — Demo Company Ltd now has 6 profiles / 4 departments / London location |
| Security | Module smoke `hr-module-security-ok`; two-tenant write smoke authored at `tests/integration/hr-two-tenant-rls-security.sql` (isolated only) |

## Verified %

Still computed only from **verified** rows in `ACCEPTANCE_REGISTER.md` (currently **25%**). Implemented-untested weight has grown; do not claim higher verified % without E2E evidence.

## Security / RLS verification

| Check | Result |
|-------|--------|
| All `hr_%` tables RLS enabled | Pass (remote) |
| anon cannot EXECUTE public `*_hr_*` RPCs | Pass |
| Two-tenant write smoke executed | **Not executed** on production (fixture file ready) |

## Next optional work

- Commit / PR when authorised
- Run two-tenant smoke on disposable Postgres
- Non-empty leave/attendance fixtures for richer reports