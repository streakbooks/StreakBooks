# Post-implementation gap analysis (2026-11-17)

## Delivered

- Unified `messaging_*` schema, RLS, outbox, DM/group/record/portal RPCs  
- Messages workspace + Discuss across core finance/HR records  
- Membership lifecycle, attachments, digests, retention, rate limits  
- Production locks: external portal kill-switch, realtime outbox publication  
- Migrations applied to linked Supabase; PR #224 on main  

## Remaining before “Production Verified”

| Gap | Severity | Notes |
| --- | -------- | ----- |
| Two-browser realtime E2E | High for Phase 1 verified | Scaffolded; run with fixtures |
| Portal isolation E2E | High before unlock | Customer/vendor flags locked |
| Firm multi-client live proof | Medium | Gated scaffold |
| Quality CI re-enabled | Medium | Workflow still commented |
| Voice/video provider | Low | Fail-closed optional |

## Honest status

Internal messaging is **production-ready with fail-closed external portals**. Do not set `MESSAGING_EXTERNAL_PORTALS_ENABLED=1` until portal isolation E2E passes.
