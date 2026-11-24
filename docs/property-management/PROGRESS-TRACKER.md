# Property Management — progress tracker

**Updated:** 2026-11-18  
**Current branch:** `feature/pm-production-posting-payouts-portals`  
**Current phase:** PM-05 / PM-09 / PM-10 posting, payouts, portals  
**Authoritative repo:** https://github.com/streakbooks/StreakBooks

## Overall progress

| Metric | Value |
| --- | --- |
| Completed batches | PM-00…PM-04 foundation/ops/statements; PM-05 posting; PM-09 payouts/trust basics; PM-10 portal grants |
| Remaining product gaps | Full trust recon, self-serve portal login UI, PMS/OTA APIs, bulk templates, management-fees workspace polish |
| Percentage complete (accounting-critical path) | ~75% — GL posting + payouts + COA mappings live; not statutory trust certified |
| Failed checks | GitHub Actions may still be blocked by **org billing** |
| Live DB (`ipxflpzfcqwtenodbxwc`) | Migrations `20261118150000`, `20261118160000`, `20261118170000` applied |

## Verification dimensions

| Dimension | Status |
| --- | --- |
| Frontend | Portfolio, ops, statements, settings COA, rent post, owner payouts, trust summary, portal invites |
| Backend | RPCs use `post_journal` (`source_type` other); permissions fail-closed |
| Database migration | Three PM migrations applied on linked remote |
| Permissions and RLS | Seeded; local `check:modules` / `check:ui` / `check:navigation` passed |
| Accounting integrity | Posting paths implemented; needs authenticated staging walkthrough with real COA |
| E2E / CI | Not green if billing blocks runners |
| Production verification | Migration applied; full authenticated ledger walkthrough not claimed |

Completion is never measured by screen count alone.
