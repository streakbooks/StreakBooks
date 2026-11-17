# Post-implementation gap analysis (2026-11-17)

Compared delivered branch work to the master directive, Phase 0 PRD and competitor matrix.

## Delivered (code present)

- Unified `messaging_*` schema, RLS, durable outbox, DM/group/record/portal RPCs  
- Permissions, access catalogue, feature catalogue key, demo settings enablement  
- Messages workspace + Discuss on invoice/PO/bill/claim/quote/contact/leave/credit-note  
- Membership revoke; add members; members panel; block/unblock UI  
- Action Center fan-out; read receipts; report moderation event  
- Approval handoff helpers that refuse informal “approved” text  
- AI assist + voice/video fail-closed stubs/UI  
- Attachments, pins, export thread, SafeMessageBody mentions  
- Portal Message Business + purchasing discuss bridges  
- Presence/typing, reactions/edit/redact, reply, leave, connection health  
- Notification preferences + digest-cron messaging worker  
- Collaboration flags + retention policy + dry-run retention purge cron  
- Send rate limiting (30/min)  
- Analytics + performance budget helpers  
- Unit/integration scaffolds and gated E2E  

## Essential gaps before production claim

| Gap | Severity | Notes |
| --- | -------- | ----- |
| Migrations not applied to staging/prod | Blocker | SQL only on branch (9 files) |
| Two-browser realtime E2E | Blocker for Phase 1 acceptance | Scaffolded; not run live |
| Live cross-tenant RLS harness | Blocker for security verified | Structural script only |
| Firm multi-client isolation E2E | High | Gated scaffold; live isolation unproven |
| Digest worker live proof | Medium | Needs Resend + cron + migrated prefs |
| Retention purge execute proof | Medium | Dry-run default; execute needs env flag + cron |
| Voice/video provider | Low | Explicitly optional / fail-closed |
| Performance budgets measured live | Medium | Budgets defined; not measured on staging |

## Honest status

The branch is a **production-oriented foundation**, not a production-verified complete system. Do not enable customer/vendor portals messaging in production until external auth tests and RLS isolation pass on a live database.
